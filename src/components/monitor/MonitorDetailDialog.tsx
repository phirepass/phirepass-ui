'use client';

import { useEffect, useState } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from 'recharts';
import dynamic from 'next/dynamic';
import { AlertTriangle, CheckCircle2, Loader2, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { LocationDetails } from '@/components/LocationDetails';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { flagFromCountryCode, hasCoordinates, locationLabel } from '@/lib/geo';
import { MONITOR_KIND_LABELS, type MonitorDetail, type MonitorSummary } from '@/types/monitor';

import { UptimeStrip } from './UptimeStrip';
import {
    STATUS_STYLES,
    effectiveStatus,
    formatDate,
    formatInterval,
    formatLatency,
    formatRelativeTime,
    formatUptime,
} from './monitor-display';

/**
 * Same OSM map the node cards open, loaded on demand: MapLibre is WebGL and
 * ~250 KB gzipped, and it must not sit in the bundle for a dialog most visits
 * never open. Client-side only — it touches `window` on construction.
 */
const MonitorLocationMap = dynamic(
    () => import('@/components/NodeLocationDetailMap').then((mod) => mod.NodeLocationDetailMap),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full w-full items-center justify-center bg-muted/30">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        ),
    }
);

interface MonitorDetailDialogProps {
    monitor: MonitorSummary | null;
    onClose: () => void;
    onCheckNow: (monitor: MonitorSummary) => Promise<void> | void;
}

function formatDuration(startIso: string, endIso: string | null): string {
    const start = new Date(startIso).getTime();
    const end = endIso ? new Date(endIso).getTime() : Date.now();
    const seconds = Math.max(0, Math.round((end - start) / 1000));

    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-hairline last:border-0">
            <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
            <span className="min-w-0 truncate font-mono text-sm text-foreground">{value}</span>
        </div>
    );
}

export function MonitorDetailDialog({ monitor, onClose, onCheckNow }: MonitorDetailDialogProps) {
    const [detail, setDetail] = useState<MonitorDetail | null>(null);
    // Starts true because the parent mounts this only when a monitor is open,
    // keyed on its id — so the first render is always a pending fetch.
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // `refreshing` is a dependency, not just a flag: flipping it after a queued
    // check re-runs this fetch so the history below reflects it.
    useEffect(() => {
        if (!monitor) return;

        let disposed = false;
        const controller = new AbortController();

        const load = async () => {
            try {
                const response = await fetch(`/api/monitors/${monitor.id}`, {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    throw new Error('Failed to load monitor history');
                }
                const data = await response.json() as MonitorDetail;
                if (disposed) return;
                setDetail(data);
            } catch (err) {
                // An abort is the dialog closing, not a failure worth reporting.
                if (disposed || (err instanceof DOMException && err.name === 'AbortError')) return;
                toast.error(err instanceof Error ? err.message : 'Failed to load monitor history');
            } finally {
                if (!disposed) setLoading(false);
            }
        };

        void load();

        return () => {
            disposed = true;
            controller.abort();
        };
    }, [monitor, refreshing]);

    if (!monitor) return null;

    const status = effectiveStatus(monitor);
    const statusStyle = STATUS_STYLES[status];
    const current = detail?.monitor ?? monitor;
    const plottable = hasCoordinates(current.location);
    const targetLocation = locationLabel(current.location);

    const chartData = (detail?.checks ?? [])
        .filter((check) => check.latency_ms !== null)
        .map((check) => ({
            time: new Date(check.checked_at).getTime(),
            latency: check.latency_ms as number,
            status: check.status,
        }));

    const handleCheckNow = async () => {
        setRefreshing(true);
        try {
            await onCheckNow(monitor);
        } finally {
            // Flipping this re-runs the effect above, pulling the new check in.
            setRefreshing(false);
        }
    };

    return (
        <Dialog open={!!monitor} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <span aria-hidden className={cn('h-3 w-3 rounded-full', statusStyle.dot)} />
                        <DialogTitle className="truncate">{monitor.name}</DialogTitle>
                        <span className={cn('text-sm font-medium', statusStyle.text)}>{statusStyle.label}</span>
                    </div>
                    <DialogDescription className="font-mono text-xs break-all">
                        {MONITOR_KIND_LABELS[monitor.kind]} · {monitor.target}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => void handleCheckNow()} disabled={refreshing}>
                        <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
                        {refreshing ? 'Checking...' : 'Check now'}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                        Checked {formatRelativeTime(current.last_checked_at)} · every{' '}
                        {formatInterval(current.interval_secs)}
                    </span>
                </div>

                {/* Uptime windows */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {([
                        { label: '24 hours', window: current.window_24h },
                        { label: '7 days', window: current.window_7d },
                        { label: '30 days', window: current.window_30d },
                    ]).map((entry) => (
                        <div key={entry.label} className="rounded-lg border border-hairline bg-card/60 p-3">
                            <p className="text-[11px] font-medium text-muted-foreground">{entry.label}</p>
                            <p className="mt-1 text-xl font-bold tabular-nums">
                                {formatUptime(entry.window.uptime_pct)}
                            </p>
                            <p className="text-[11px] text-muted-foreground/70">
                                {entry.window.checks} checks · {entry.window.down_checks} failed
                            </p>
                        </div>
                    ))}
                </div>

                <div>
                    <p className="mb-2 text-[11px] font-medium text-muted-foreground">Last 30 days</p>
                    <UptimeStrip daily={current.daily} />
                </div>

                {/* Response time */}
                <div>
                    <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                        Response time ({chartData.length} recent checks)
                    </p>
                    {chartData.length < 2 ? (
                        <div className="rounded-lg border border-dashed border-hairline px-4 py-10 text-center text-sm text-muted-foreground">
                            {loading ? 'Loading history...' : 'Not enough checks recorded yet to plot a trend.'}
                        </div>
                    ) : (
                        <div className="h-56 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                                    <defs>
                                        <linearGradient id="latencyFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="time"
                                        type="number"
                                        domain={['dataMin', 'dataMax']}
                                        tickFormatter={(value: number) =>
                                            new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        }
                                        stroke="hsl(var(--muted-foreground))"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        minTickGap={40}
                                    />
                                    <YAxis
                                        stroke="hsl(var(--muted-foreground))"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        width={52}
                                        tickFormatter={(value: number) => `${value}ms`}
                                    />
                                    <RechartsTooltip
                                        contentStyle={{
                                            background: 'hsl(var(--popover))',
                                            border: '1px solid hsl(var(--border))',
                                            borderRadius: 'var(--radius)',
                                            fontSize: 12,
                                        }}
                                        labelFormatter={(value) => new Date(Number(value)).toLocaleString()}
                                        formatter={(value) => [`${Number(value)}ms`, 'Response time']}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="latency"
                                        stroke="hsl(var(--accent))"
                                        strokeWidth={2}
                                        fill="url(#latencyFill)"
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Where the target resolves to. Mounted only while the dialog is
                    open and only when there is something to plot, so the WebGL
                    map is never built for a monitor that has no location. */}
                {plottable ? (
                    <div>
                        <p className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />
                            Target location
                            <span className="ml-auto normal-case tracking-normal text-muted-foreground/80">
                                {flagFromCountryCode(current.location?.country_code)} {targetLocation}
                            </span>
                        </p>
                        <div className="h-64 w-full overflow-hidden rounded-lg border border-hairline">
                            <MonitorLocationMap
                                latitude={current.location!.latitude!}
                                longitude={current.location!.longitude!}
                                label={targetLocation || current.name}
                                className="h-full w-full"
                            />
                        </div>
                        <LocationDetails location={current.location} className="mt-3" />
                    </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                    {/* Certificate / domain facts */}
                    <div>
                        <p className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Certificate &amp; registration
                        </p>
                        <div className="rounded-lg border border-hairline bg-card/60 px-3 py-1">
                            {current.cert_expires_at || current.domain_expires_at ? (
                                <>
                                    {current.cert_subject ? <Row label="Subject" value={current.cert_subject} /> : null}
                                    {current.cert_issuer ? <Row label="Issuer" value={current.cert_issuer} /> : null}
                                    {current.cert_expires_at ? (
                                        <Row label="Cert expires" value={formatDate(current.cert_expires_at)} />
                                    ) : null}
                                    {current.domain_registrar ? (
                                        <Row label="Registrar" value={current.domain_registrar} />
                                    ) : null}
                                    {current.domain_expires_at ? (
                                        <Row label="Domain expires" value={formatDate(current.domain_expires_at)} />
                                    ) : null}
                                </>
                            ) : (
                                <p className="py-3 text-sm text-muted-foreground">
                                    This monitor kind does not observe a certificate or registration.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Incidents */}
                    <div>
                        <p className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Incidents
                        </p>
                        <div className="space-y-2">
                            {(detail?.incidents ?? []).length === 0 ? (
                                <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-3 text-sm text-success">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    No incidents recorded
                                </div>
                            ) : (
                                detail!.incidents.map((incident) => (
                                    <div
                                        key={incident.id}
                                        className={cn(
                                            'rounded-lg border px-3 py-2 text-sm',
                                            incident.resolved_at
                                                ? 'border-hairline bg-secondary/40'
                                                : 'border-destructive/40 bg-destructive/10'
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span
                                                className={cn(
                                                    'text-xs font-medium',
                                                    incident.resolved_at ? 'text-muted-foreground' : 'text-destructive'
                                                )}
                                            >
                                                {incident.resolved_at ? 'Resolved' : 'Ongoing'}
                                            </span>
                                            <span className="font-mono text-xs text-muted-foreground">
                                                {formatDuration(incident.started_at, incident.resolved_at)}
                                            </span>
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {new Date(incident.started_at).toLocaleString()}
                                        </p>
                                        {incident.cause ? (
                                            <p className="mt-1 break-words text-xs text-foreground/80 first-letter:uppercase">{incident.cause}</p>
                                        ) : null}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Recent checks */}
                <div>
                    <p className="mb-2 text-[11px] font-medium text-muted-foreground">Recent checks</p>
                    <div className="max-h-56 overflow-y-auto rounded-lg border border-hairline">
                        <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 bg-card">
                                <tr className="border-b border-hairline text-muted-foreground">
                                    <th className="px-3 py-2 font-medium">Time</th>
                                    <th className="px-3 py-2 font-medium">Status</th>
                                    <th className="px-3 py-2 font-medium">Latency</th>
                                    <th className="px-3 py-2 font-medium">Detail</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...(detail?.checks ?? [])].reverse().slice(0, 60).map((check, index) => (
                                    <tr key={`${check.checked_at}-${index}`} className="border-b border-hairline last:border-0">
                                        <td className="whitespace-nowrap px-3 py-1.5 font-mono text-muted-foreground">
                                            {new Date(check.checked_at).toLocaleTimeString()}
                                        </td>
                                        <td className={cn('px-3 py-1.5 font-medium', STATUS_STYLES[check.status].text)}>
                                            <span className="flex items-center gap-1.5">
                                                {STATUS_STYLES[check.status].label}
                                                {/*
                                                  * `unknown` on its own does not say whether the
                                                  * agent timed out, dropped, or shed the probe —
                                                  * which is the first thing anyone reading this
                                                  * table wants to know.
                                                  */}
                                                {check.reason ? (
                                                    <span className="rounded border border-warning/40 bg-warning/10 px-1 py-px font-mono text-[10px] uppercase tracking-wide text-warning">
                                                        {check.reason.replace(/_/g, ' ')}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                                            {formatLatency(check.latency_ms)}
                                        </td>
                                        <td className="px-3 py-1.5 text-muted-foreground first-letter:uppercase">
                                            {check.error ?? (check.status_code ? `HTTP ${check.status_code}` : '—')}
                                        </td>
                                    </tr>
                                ))}
                                {(detail?.checks ?? []).length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                                            {loading ? 'Loading checks...' : 'No checks recorded yet.'}
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
