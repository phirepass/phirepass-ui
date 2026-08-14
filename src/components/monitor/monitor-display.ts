import { Globe, Lock, Tag, type LucideIcon } from 'lucide-react';

import type { MonitorKind, MonitorStatus, MonitorSummary } from '@/types/monitor';

/**
 * One icon per probe kind, so a card announces what it watches before you read
 * it. Silhouettes are deliberately unalike — a ruled circle, a padlock, an
 * angled tag — because these render at 14px beside a label and the previous
 * lock/shield pair was indistinguishable at that size.
 */
export const KIND_ICONS: Record<MonitorKind, LucideIcon> = {
    http: Globe,
    ssl: Lock,
    domain: Tag,
};

/**
 * Colour per kind, so the badge is separable at a glance rather than being a
 * third grey chip in a row of grey chips. These are hues the status scale does
 * not lead with — status is carried by the dot and the status word, and the
 * kind badge is always a bordered pill with its label attached, so the two
 * never have to be told apart on colour alone.
 */
export const KIND_STYLES: Record<MonitorKind, { text: string; chip: string }> = {
    http: { text: 'text-info', chip: 'border-info/30 bg-info/10 text-info' },
    ssl: { text: 'text-violet', chip: 'border-violet/30 bg-violet/10 text-violet' },
    domain: { text: 'text-warning', chip: 'border-warning/30 bg-warning/10 text-warning' },
};

/**
 * Status colours, deliberately mapped onto the same semantic tokens the node
 * cards use: green means healthy everywhere in the product, amber means "worth
 * a look", red means broken.
 */
export const STATUS_STYLES: Record<MonitorStatus, { label: string; text: string; dot: string; panel: string }> = {
    up: { label: 'Up', text: 'text-success', dot: 'bg-success', panel: 'border-success/35 bg-success/10' },
    degraded: { label: 'Degraded', text: 'text-warning', dot: 'bg-warning', panel: 'border-warning/40 bg-warning/10' },
    down: { label: 'Down', text: 'text-destructive', dot: 'bg-destructive', panel: 'border-destructive/40 bg-destructive/10' },
    unknown: { label: 'Unknown', text: 'text-muted-foreground', dot: 'bg-muted-foreground/60', panel: 'border-border bg-secondary/40' },
    paused: { label: 'Paused', text: 'text-muted-foreground', dot: 'bg-muted-foreground/40', panel: 'border-border bg-secondary/40' },
};

/** A paused monitor reports paused regardless of the last result it recorded. */
export function effectiveStatus(monitor: { paused: boolean; last_status: MonitorStatus | null }): MonitorStatus {
    if (monitor.paused) return 'paused';
    return monitor.last_status ?? 'unknown';
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysUntil(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const target = new Date(iso).getTime();
    if (!Number.isFinite(target)) return null;
    return Math.floor((target - Date.now()) / DAY_MS);
}

/** The expiry a monitor actually tracks, if any — certificate or registration. */
export function expiryFor(monitor: MonitorSummary): { kind: 'certificate' | 'domain'; at: string; days: number } | null {
    if (monitor.cert_expires_at) {
        const days = daysUntil(monitor.cert_expires_at);
        if (days !== null) return { kind: 'certificate', at: monitor.cert_expires_at, days };
    }
    if (monitor.domain_expires_at) {
        const days = daysUntil(monitor.domain_expires_at);
        if (days !== null) return { kind: 'domain', at: monitor.domain_expires_at, days };
    }
    return null;
}

export function formatRelativeTime(iso: string | null | undefined): string {
    if (!iso) return 'never';
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return 'unknown';

    const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

export function formatInterval(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
}

export function formatUptime(pct: number | null): string {
    if (pct === null) return '—';
    // Three decimals only where they carry meaning: 99.9 and 99.987 are very
    // different promises, but "100.000%" is just noise.
    if (pct === 100) return '100%';
    return `${pct.toFixed(pct >= 99 ? 3 : 1)}%`;
}

export function formatLatency(ms: number | null): string {
    if (ms === null) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

export function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'unknown';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
