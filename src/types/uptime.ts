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
    checks: number;
    down_checks: number;
}

/** One calendar day of history, used by the 30-day bar strip. */
export interface DailyBucket {
    day: string;
    uptime_pct: number | null;
    checks: number;
    down_checks: number;
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
}

export const MONITOR_KIND_LABELS: Record<MonitorKind, string> = {
    http: 'HTTP(S)',
    ssl: 'SSL certificate',
    domain: 'Domain expiry',
};

export const MONITOR_KIND_HINTS: Record<MonitorKind, string> = {
    http: 'Requests a URL and checks the status code, optional keyword, and response time.',
    ssl: 'Inspects the TLS certificate served by host:port and warns before it expires.',
    domain: 'Looks the domain up over RDAP and warns before the registration lapses.',
};

export const INTERVAL_OPTIONS = [
    { label: '1 minute', value: 60 },
    { label: '5 minutes', value: 300 },
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
    http: 300,
    ssl: 86400,
    domain: 86400,
};
