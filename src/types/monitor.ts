/**
 * Shared vocabulary for the uptime service. Imported by both the API routes and
 * the dashboard, so the wire shape has exactly one definition.
 */

import type { PublicIpLocation } from './geo';

/** What a monitor actually probes. */
export type MonitorKind = 'http' | 'ssl' | 'domain';

/**
 * `degraded` is a first-class state rather than a flavour of up: a site that
 * answers in 8s, or a certificate two days from expiry, is not healthy but
 * paging someone for it at 3am is wrong. `unknown` means the probe itself could
 * not reach a verdict (an RDAP registry being down says nothing about a domain).
 */
export type MonitorStatus = 'up' | 'degraded' | 'down' | 'unknown' | 'paused';

export type KeywordMode = 'contains' | 'absent';

export interface Monitor {
    id: string;
    name: string;
    kind: MonitorKind;
    target: string;
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
    created_at: string;
    updated_at: string;

    /**
     * Which vantage point runs the probe. `null` is the server fleet — the
     * target as the public internet sees it. A node id runs the probe on that
     * agent instead, which is the only way to watch a service that is not
     * reachable from outside its own network.
     *
     * Only ever one of the caller's own nodes; the API scopes the list by the
     * authenticated user.
     */
    node_id: string | null;
    /**
     * Denormalised so a card can name the agent without fetching the node list.
     * Null when `node_id` is null, or when the node has since been deleted.
     */
    node_name: string | null;
    /**
     * What an offline agent means for this monitor.
     *
     * `false` (the default) records `unknown` and stays quiet — the probe never
     * ran, so nothing was learned about the target, and an agent restart is not
     * an outage of the thing it watches. `true` records `down` and alerts,
     * treating the agent's own availability as part of what is being watched.
     *
     * Either way a check is written, so history stays continuous and a gap is
     * visible on the strip; the flag decides the verdict, not whether one is
     * recorded.
     */
    agent_offline_is_outage: boolean;

    last_status: MonitorStatus | null;
    last_checked_at: string | null;
    last_latency_ms: number | null;
    last_status_code: number | null;
    last_error: string | null;

    cert_expires_at: string | null;
    cert_issuer: string | null;
    cert_subject: string | null;
    domain_expires_at: string | null;
    domain_registrar: string | null;

    /**
     * Where the probe target resolves to, geolocated from the address the check
     * actually connected to.
     *
     * `null` whenever there is nothing public to place: a target on a private
     * range, a hostname that does not resolve, or a `domain` monitor, which asks
     * a registry about a name and never opens a connection at all.
     */
    location: PublicIpLocation | null;
}

export interface UptimeWindow {
    /** Percentage of non-down checks in the window, or null with no data. */
    uptime_pct: number | null;
    avg_latency_ms: number | null;
    /** Every check performed, including ones that reached no verdict. */
    checks: number;
    down_checks: number;
    /**
     * Checks that reached no verdict — an agent that timed out, disconnected,
     * or shed the probe.
     *
     * A subset of `checks`, so a timeout still increments the count: it did
     * happen, and hiding it makes a broken agent look like an idle one. It is
     * subtracted out of the `uptime_pct` denominator instead, so "we could not
     * tell" is never scored as uptime.
     */
    unknown_checks: number;
    /**
     * Checks that answered correctly but too slowly.
     *
     * Not subtracted from uptime — a slow success is still a success — but
     * counted so the strip can show it. Without this a monitor that has been
     * degraded all day computes to 100% and draws solid green, which is the
     * whole reason `degraded` exists as a state.
     */
    degraded_checks: number;
}

/** One calendar day of history, used by the 30-day bar strip. */
export interface DailyBucket {
    day: string;
    uptime_pct: number | null;
    /** Every check performed that day, including ones with no verdict. */
    checks: number;
    down_checks: number;
    /** Checks that reached no verdict; see `UptimeWindow.unknown_checks`. */
    unknown_checks: number;
    /** Checks that were slow but correct; see `UptimeWindow.degraded_checks`. */
    degraded_checks: number;
    avg_latency_ms: number | null;
}

export interface MonitorSummary extends Monitor {
    window_24h: UptimeWindow;
    window_7d: UptimeWindow;
    window_30d: UptimeWindow;
    daily: DailyBucket[];
    open_incident_since: string | null;
}

export interface CheckPoint {
    checked_at: string;
    status: MonitorStatus;
    latency_ms: number | null;
    status_code: number | null;
    error: string | null;
    /**
     * Machine-readable category behind the verdict, e.g. `agent_timeout`,
     * `agent_disconnected`, `target_unreachable`. Null for an ordinary result.
     */
    reason: string | null;
}

export interface Incident {
    id: string;
    monitor_id: string;
    started_at: string;
    resolved_at: string | null;
    cause: string | null;
    status_code: number | null;
}

export interface MonitorDetail {
    monitor: MonitorSummary;
    checks: CheckPoint[];
    incidents: Incident[];
}

/** A status tally, in the vocabulary `MonitorStatus` already uses. */
export type MonitorStatusCounts = Record<'up' | 'degraded' | 'down' | 'unknown' | 'paused', number>;

/** Which clock a monitor is running down, and how much is left on it. */
export interface MonitorExpiryRef {
    id: string;
    name: string;
    kind: 'certificate' | 'domain';
    expires_at: string;
    /** Whole days remaining; negative once it has lapsed. */
    days: number;
}

/**
 * One probe kind, described rather than listed.
 *
 * This is what the overview renders. It is aggregated in SQL precisely so the
 * landing page never has to pull every monitor and its thirty days of history
 * across the wire to draw three panels.
 */
export interface MonitorKindSummary {
    kind: MonitorKind;
    total: number;
    counts: MonitorStatusCounts;
    /**
     * Uptime across every check this kind recorded in the last 24 hours.
     *
     * Pooled over checks, not averaged over monitors: a kind holding one busy
     * monitor and nine idle ones should report what actually happened, and a
     * mean of per-monitor percentages would let a single quiet monitor swing it.
     * `null` when nothing reached a verdict in the window.
     */
    uptime_24h_pct: number | null;
    /** The worst monitor of this kind right now, or null when all are healthy. */
    worst: {
        id: string;
        name: string;
        status: MonitorStatus;
        last_checked_at: string | null;
    } | null;
    /** The soonest expiry of this kind, regardless of its warning window. */
    next_expiry: MonitorExpiryRef | null;
    /**
     * Fourteen days of history for the panel's strip, oldest first, aggregated
     * across every monitor of this kind.
     *
     * Days that recorded nothing are present and empty rather than absent — the
     * strip draws one bar per entry, so a missing day would compress the
     * timeline and stop the bars lining up with dates.
     */
    daily: DailyBucket[];
}

/** A monitor that currently warrants a line in the alert strip. */
export interface MonitorProblem {
    id: string;
    kind: MonitorKind;
    name: string;
    target: string;
    status: MonitorStatus;
    last_error: string | null;
    degraded_ms: number;
    /** Set when the monitor is inside its own expiry warning window. */
    expiry: MonitorExpiryRef | null;
}

/** The whole payload behind `/dashboard/monitors`. */
export interface MonitorOverview {
    total: number;
    counts: MonitorStatusCounts;
    kinds: MonitorKindSummary[];
    /**
     * Everything down, degraded, or near expiry — capped.
     *
     * Bounded because the alert strip is a summary, not an inventory: a fleet
     * with four hundred simultaneous outages does not need four hundred rows to
     * communicate that, and the cap is what keeps this endpoint's cost flat.
     */
    problems: MonitorProblem[];
    /** True when `problems` hit the cap and more exist. */
    problems_truncated: boolean;
}

/** One page of monitors, with the total the pager needs. */
export interface MonitorListPage {
    monitors: MonitorSummary[];
    total: number;
    page: number;
    limit: number;
}

export interface MonitorInput {
    name: string;
    kind: MonitorKind;
    target: string;
    interval_secs?: number;
    timeout_ms?: number;
    method?: string;
    expected_status?: number[];
    keyword?: string | null;
    keyword_mode?: KeywordMode;
    follow_redirects?: boolean;
    degraded_ms?: number;
    expiry_warn_days?: number;
    paused?: boolean;
    node_id?: string | null;
    agent_offline_is_outage?: boolean;
}

export const MONITOR_KIND_LABELS: Record<MonitorKind, string> = {
    http: 'HTTP(S)',
    ssl: 'SSL certificate',
    domain: 'Domain expiry',
};

export const MONITOR_KIND_HINTS: Record<MonitorKind, string> = {
    http: 'Requests a URL and checks the status code, optional keyword, and response time.',
    ssl: 'Inspects the TLS certificate at host:port and warns before it expires. Use a hostname, not an IP.',
    domain: 'Asks the registry over RDAP and warns before the registration lapses. Some TLDs publish no expiry date.',
};

/**
 * Which kinds can currently be created. All three are implemented; the map stays
 * because it is how a kind is introduced — specified end to end, offered
 * disabled, then turned on here once its probe lands.
 */
export const MONITOR_KIND_ENABLED: Record<MonitorKind, boolean> = {
    http: true,
    ssl: true,
    domain: true,
};

/**
 * Every kind runs from an agent, so every kind needs a vantage.
 *
 * `domain` is the awkward one and it is worth being honest about: an RDAP query
 * asks a registry about a name and never touches the domain's own hosts, so the
 * answer does not depend on which agent asks. The dropdown is therefore not
 * choosing *what* you learn, only *who* asks — which does matter for one real
 * reason, since registries rate-limit by source address and a fleet spreads that
 * load. The alternative was nodeless monitors: `node_id` made nullable, a second
 * claim path in the scheduler, and a dispatch fork away from the WebSocket. That
 * was judged too much machinery to remove one dropdown. See MONITOR.md.
 */
export const KIND_SUPPORTS_AGENT: Record<MonitorKind, boolean> = {
    http: true,
    ssl: true,
    domain: true,
};

/**
 * Fifteen minutes is the floor, not a default. The scheduler polls for due
 * monitors once a minute, so anything near that cannot be honoured — a short
 * monitor would drift with the tick, promising a cadence the backend does not
 * deliver, and every extra check is load on the agent that runs it.
 */
export const MIN_INTERVAL_SECS = 900;

export const INTERVAL_OPTIONS = [
    { label: '15 minutes', value: 900 },
    { label: '1 hour', value: 3600 },
    { label: '6 hours', value: 21600 },
    { label: '1 day', value: 86400 },
];

/**
 * Expiry-style monitors are answered by a registry or a handshake, not by the
 * service under test, so hammering them buys nothing and can get you rate
 * limited. Both default to daily.
 */
export const DEFAULT_INTERVAL_BY_KIND: Record<MonitorKind, number> = {
    http: 900,
    ssl: 86400,
    domain: 86400,
};
