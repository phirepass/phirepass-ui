import {
    MIN_INTERVAL_SECS,
    MONITOR_KIND_ENABLED,
    type KeywordMode,
    type MonitorKind,
} from '@/types/monitor';

/**
 * Validation for monitor create/update bodies.
 *
 * Hand-rolled in the style of the `nodes` route rather than with zod, which is a
 * dependency but is not used anywhere in this codebase yet.
 *
 * Nothing here trusts a client-side constraint: the form already enforces the
 * interval floor and hides the disabled kinds, but both are affordances, and a
 * direct POST reaches this code instead.
 */

export type ParsedMonitor = {
    name: string;
    kind: MonitorKind;
    target: string;
    node_id: string;
    interval_secs: number;
    timeout_ms: number;
    method: string;
    expected_status: number[];
    keyword: string | null;
    keyword_mode: KeywordMode;
    follow_redirects: boolean;
    degraded_ms: number;
    expiry_warn_days: number;
    paused: boolean;
    agent_offline_is_outage: boolean;
};

export type ParseResult =
    | { ok: true; value: ParsedMonitor }
    | { ok: false; error: string };

const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rejects an `ssl` target the agent's parser would refuse, returning the reason
 * or `null` when it is fine.
 *
 * Mirrors `parse_target` in `agent/src/probe/ssl.rs`. Worth duplicating: without
 * it a typo is accepted at creation and then reports `unknown` once a day
 * forever, which reads as a broken agent rather than a bad target — and the
 * scheduler would keep dispatching it.
 */
function sslTargetError(target: string): string | null {
    // A path means someone pasted a URL and kept too much of it. The agent
    // tolerates it, but silently checking a different thing than the field shows
    // is worse than asking for the host.
    const authority = target.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    if (/[/?#]/.test(authority)) {
        return 'TLS monitors take a host and optional port, not a URL path';
    }

    let host = authority;
    let port: string | null = null;

    if (authority.startsWith('[')) {
        const close = authority.indexOf(']');
        if (close === -1) return 'Unclosed [ in the IPv6 address';
        host = authority.slice(1, close);
        const tail = authority.slice(close + 1);
        if (tail.startsWith(':')) port = tail.slice(1);
        else if (tail.length > 0) return 'Unexpected text after the IPv6 address';
    } else {
        const lastColon = authority.lastIndexOf(':');
        // Only a port when the head holds no further colon, or a bare
        // `2001:db8::1` would be read as host `2001:db8:` and port `:1`.
        if (lastColon !== -1 && !authority.slice(0, lastColon).includes(':')) {
            host = authority.slice(0, lastColon);
            port = authority.slice(lastColon + 1);
        }
    }

    if (!host) return 'Target needs a host';
    if (host.length > 253) return 'Host is too long';

    if (port !== null) {
        const parsed = Number(port);
        if (!/^\d+$/.test(port) || parsed < 1 || parsed > 65535) {
            return 'Port must be between 1 and 65535';
        }
    }

    return null;
}

/**
 * Rejects a `domain` target the agent's parser would refuse, returning the
 * reason or `null` when it is fine.
 *
 * Mirrors `parse_domain` in `agent/src/probe/domain.rs`, and matters more here
 * than the TLS validator does: an unregistered name comes back from the registry
 * as a 404, which this kind reports as **down** — because that is what a lapsed
 * registration looks like. A typo reaching the registry would therefore be shown
 * as an expired domain. Catching the malformed shapes up front is what keeps
 * that verdict trustworthy.
 */
function domainTargetError(target: string): string | null {
    const withoutScheme = target.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    const authority = withoutScheme.split(/[/?#]/)[0];
    const host = (authority.split('@').pop() ?? '')
        .split(':')[0]
        .replace(/\.$/, '')
        .toLowerCase();

    if (!host) return 'Target needs a domain name';
    if (host.length > 253) return 'Domain is too long';

    // An address has no registration to expire.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
        return 'Enter a domain name, not an IP address';
    }

    const labels = host.split('.');
    if (labels.length < 2) return 'Enter a full domain, including its TLD';

    for (const label of labels) {
        if (!label) return 'Domain has an empty label';
        if (label.length > 63) return 'A label in the domain is too long';
        if (!/^[a-z0-9-]+$/.test(label)) {
            return 'Domain may only contain letters, digits and hyphens';
        }
        if (label.startsWith('-') || label.endsWith('-')) {
            return 'A domain label may not start or end with a hyphen';
        }
    }

    return null;
}

function str(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function int(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value);
    return fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

/**
 * Parses a full monitor body, applying the same defaults the schema declares.
 *
 * `defaults` carries the existing row on update, so a PATCH that omits a field
 * keeps its current value rather than resetting it to the schema default.
 */
export function parseMonitor(
    payload: Record<string, unknown>,
    defaults?: Partial<ParsedMonitor>,
): ParseResult {
    const name = str(payload.name) || defaults?.name || '';
    if (!name) return { ok: false, error: 'Name is required' };
    if (name.length > 120) return { ok: false, error: 'Name must be 120 characters or less' };

    const kindRaw = str(payload.kind) || defaults?.kind || '';
    if (kindRaw !== 'http' && kindRaw !== 'ssl' && kindRaw !== 'domain') {
        return { ok: false, error: 'Unknown monitor kind' };
    }
    const kind = kindRaw as MonitorKind;
    if (!MONITOR_KIND_ENABLED[kind]) {
        return { ok: false, error: `${kind} monitors are not available yet` };
    }

    const target = str(payload.target) || defaults?.target || '';
    if (!target) return { ok: false, error: 'Target is required' };
    if (target.length > 2048) return { ok: false, error: 'Target is too long' };
    if (kind === 'http' && !/^https?:\/\//i.test(target)) {
        return { ok: false, error: 'HTTP monitors need a target starting with http:// or https://' };
    }
    if (kind === 'ssl') {
        const invalid = sslTargetError(target);
        if (invalid) return { ok: false, error: invalid };
    }
    if (kind === 'domain') {
        const invalid = domainTargetError(target);
        if (invalid) return { ok: false, error: invalid };
    }

    const nodeId = str(payload.node_id) || defaults?.node_id || '';
    if (!nodeId) return { ok: false, error: 'Choose the agent this check should run from' };
    if (!UUID_RE.test(nodeId)) return { ok: false, error: 'Invalid agent' };

    const intervalSecs = int(payload.interval_secs, defaults?.interval_secs ?? MIN_INTERVAL_SECS);
    if (intervalSecs < MIN_INTERVAL_SECS) {
        return { ok: false, error: `Interval must be at least ${MIN_INTERVAL_SECS / 60} minutes` };
    }
    if (intervalSecs > 86400 * 7) return { ok: false, error: 'Interval is too long' };

    const timeoutMs = int(payload.timeout_ms, defaults?.timeout_ms ?? 10000);
    if (timeoutMs < 500 || timeoutMs > 120000) {
        return { ok: false, error: 'Timeout must be between 500ms and 120000ms' };
    }

    const method = (str(payload.method) || defaults?.method || 'GET').toUpperCase();
    if (!ALLOWED_METHODS.includes(method)) {
        return { ok: false, error: 'Unsupported HTTP method' };
    }

    const rawStatuses = Array.isArray(payload.expected_status)
        ? payload.expected_status
        : defaults?.expected_status ?? [];
    const expectedStatus: number[] = [];
    for (const entry of rawStatuses) {
        const code = int(entry, 0);
        if (code < 100 || code > 599) {
            return { ok: false, error: 'Expected status codes must be between 100 and 599' };
        }
        expectedStatus.push(code);
    }

    const keywordRaw = payload.keyword === undefined ? defaults?.keyword ?? null : payload.keyword;
    const keyword = typeof keywordRaw === 'string' && keywordRaw.trim() ? keywordRaw.trim() : null;
    if (keyword && keyword.length > 512) {
        return { ok: false, error: 'Keyword is too long' };
    }

    const keywordModeRaw = str(payload.keyword_mode) || defaults?.keyword_mode || 'contains';
    if (keywordModeRaw !== 'contains' && keywordModeRaw !== 'absent') {
        return { ok: false, error: 'Invalid keyword mode' };
    }

    const degradedMs = int(payload.degraded_ms, defaults?.degraded_ms ?? 1500);
    if (degradedMs <= 0) return { ok: false, error: 'Degraded threshold must be positive' };
    if (degradedMs > timeoutMs) {
        // A threshold above the timeout can never be reached: the request is
        // abandoned before it could be judged slow, so the monitor would only
        // ever report up or down and `degraded` would be dead configuration.
        return { ok: false, error: 'Degraded threshold cannot exceed the timeout' };
    }

    const expiryWarnDays = int(payload.expiry_warn_days, defaults?.expiry_warn_days ?? 21);
    if (expiryWarnDays < 1 || expiryWarnDays > 365) {
        return { ok: false, error: 'Expiry warning must be between 1 and 365 days' };
    }

    return {
        ok: true,
        value: {
            name,
            kind,
            target,
            node_id: nodeId,
            interval_secs: intervalSecs,
            timeout_ms: timeoutMs,
            method,
            expected_status: expectedStatus,
            keyword,
            keyword_mode: keywordModeRaw as KeywordMode,
            follow_redirects: bool(payload.follow_redirects, defaults?.follow_redirects ?? true),
            degraded_ms: degradedMs,
            expiry_warn_days: expiryWarnDays,
            paused: bool(payload.paused, defaults?.paused ?? false),
            agent_offline_is_outage: bool(
                payload.agent_offline_is_outage,
                defaults?.agent_offline_is_outage ?? false,
            ),
        },
    };
}
