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
