import {
    Activity,
    AlertTriangle,
    CalendarClock,
    Clock,
    Gauge,
    HardDrive,
    MoreVertical,
    Pause,
    Pencil,
    Play,
    RefreshCw,
    Timer,
    Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LocationStrip } from '@/components/LocationStrip';
import { cn } from '@/lib/utils';
import { hasCoordinates, locationLabel } from '@/lib/geo';
import { MONITOR_KIND_LABELS, type MonitorSummary } from '@/types/uptime';

import { UptimeStrip } from './UptimeStrip';
import {
    KIND_ICONS,
    STATUS_STYLES,
    effectiveStatus,
    expiryFor,
    formatDate,
    formatInterval,
    formatLatency,
    formatRelativeTime,
    formatUptime,
} from './monitor-display';

interface MonitorCardProps {
    monitor: MonitorSummary;
    onOpen: (monitor: MonitorSummary) => void;
    onCheckNow: (monitor: MonitorSummary) => void;
    onTogglePause: (monitor: MonitorSummary) => void;
    onEdit: (monitor: MonitorSummary) => void;
    onDelete: (monitor: MonitorSummary) => void;
    /** True while this specific monitor has a manual check in flight. */
    checking?: boolean;
}

export function MonitorCard({
    monitor,
    onOpen,
    onCheckNow,
    onTogglePause,
    onEdit,
    onDelete,
    checking = false,
}: MonitorCardProps) {
    const status = effectiveStatus(monitor);
    const statusStyle = STATUS_STYLES[status];
    const KindIcon = KIND_ICONS[monitor.kind];
    const expiry = expiryFor(monitor);
    const expirySoon = expiry !== null && expiry.days <= monitor.expiry_warn_days;

    const uptime24h = monitor.window_24h.uptime_pct;
    const latency = monitor.last_latency_ms ?? monitor.window_24h.avg_latency_ms;

    // Same locator the node cards use. Absent for `domain` monitors and private
    // targets, which have nothing public to resolve — the strip renders nothing
    // in that case rather than an empty frame.
    const plottable = hasCoordinates(monitor.location);
    const targetLocation = locationLabel(monitor.location);

    // Latency as a share of the degraded threshold, so the bar fills as a target
    // slows toward being unacceptable and changes tone on the way.
    const latencyPercent = latency === null
        ? 0
        : Math.min(100, (latency / Math.max(1, monitor.degraded_ms)) * 100);
    const latencyTone = latency === null
        ? 'text-muted-foreground'
        : latencyPercent >= 100
            ? 'text-destructive'
            : latencyPercent >= 70
                ? 'text-warning'
                : 'text-accent';
    const latencyBar = latency === null
        ? 'bg-muted-foreground/40'
        : latencyPercent >= 100
            ? 'bg-destructive'
            : latencyPercent >= 70
                ? 'bg-warning'
                : 'bg-accent';

    return (
        <div className="@container relative overflow-hidden rounded-xl md:overflow-visible">
            <div
                className={cn(
                    'group gradient-card border border-border rounded-xl p-5 bg-card relative h-full flex flex-col',
                    'transition-transform duration-300',
                    'hover:border-primary/50 hover:shadow-[0_0_30px_hsl(var(--primary)/0.08)]',
                    monitor.paused && 'opacity-70'
                )}
            >
                {/* Header */}
                <div className="relative z-30 flex items-start">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span
                            aria-hidden
                            className={cn(
                                // Nudged down to sit on the baseline of the title
                                // rather than centring against the whole header.
                                'w-3 h-3 rounded-full shrink-0 mt-[7px]',
                                statusStyle.dot,
                                status === 'up' && 'animate-pulse-glow text-success',
                                status === 'down' && 'animate-pulse-glow text-destructive'
                            )}
                        />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 min-w-0">
                                <button
                                    type="button"
                                    onClick={() => onOpen(monitor)}
                                    className="min-w-0 truncate text-left font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                                >
                                    {monitor.name}
                                </button>
                                <div className="relative z-30 flex items-center gap-2 flex-shrink-0">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary/60 hover:text-foreground"
                                                aria-label={`Open actions for ${monitor.name}`}
                                            >
                                                <MoreVertical className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                            align="end"
                                            className="w-56 rounded-xl border-border/70 bg-popover/95 p-2 shadow-xl backdrop-blur"
                                        >
                                            <DropdownMenuLabel className="px-2 py-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                                                        Monitor
                                                    </span>
                                                    <span className={cn('text-[11px] font-medium', statusStyle.text)}>
                                                        {statusStyle.label}
                                                    </span>
                                                </div>
                                            </DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => onCheckNow(monitor)} disabled={checking}>
                                                <RefreshCw className={cn('mr-2 w-4 h-4', checking && 'animate-spin')} />
                                                {checking ? 'Checking...' : 'Check now'}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => onTogglePause(monitor)}>
                                                {monitor.paused ? (
                                                    <Play className="mr-2 w-4 h-4" />
                                                ) : (
                                                    <Pause className="mr-2 w-4 h-4" />
                                                )}
                                                {monitor.paused ? 'Resume checks' : 'Pause checks'}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => onEdit(monitor)}>
                                                <Pencil className="mr-2 w-4 h-4" />
                                                Edit monitor
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => onDelete(monitor)}
                                                className="text-destructive focus:text-destructive"
                                            >
                                                <Trash2 className="mr-2 w-4 h-4" />
                                                Delete monitor
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                            {monitor.open_incident_since ? (
                                <p className="flex items-center gap-1.5 text-xs text-destructive">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    Down since {formatRelativeTime(monitor.open_incident_since)}
                                </p>
                            ) : expirySoon && expiry ? (
                                <p className="flex items-center gap-1.5 text-xs text-warning">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    {expiry.kind === 'certificate' ? 'Certificate' : 'Domain'} expires in {expiry.days}d
                                </p>
                            ) : null}
                        </div>
                    </div>
                </div>

                {/* Target */}
                <div className="flex items-center gap-2 mb-4 mt-1 min-w-0">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                                {monitor.target}
                            </p>
                        </TooltipTrigger>
                        <TooltipContent>{monitor.target}</TooltipContent>
                    </Tooltip>
                    {/*
                      * Only agent-run monitors are badged. Server vantage is the
                      * default and marking it too would put a label on every card
                      * to say nothing.
                      */}
                    {monitor.node_id ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="flex max-w-[9rem] items-center gap-1.5 whitespace-nowrap rounded bg-secondary px-2 py-1 text-xs text-muted-foreground">
                                    <HardDrive className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{monitor.node_name ?? 'agent'}</span>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                Checked from {monitor.node_name ?? 'an agent'}
                                {monitor.agent_offline_is_outage
                                    ? ' — reported down while that agent is offline'
                                    : ' — recorded as unknown while that agent is offline'}
                            </TooltipContent>
                        </Tooltip>
                    ) : null}
                    <span className="flex items-center gap-1.5 whitespace-nowrap rounded bg-secondary px-2 py-1 text-xs text-muted-foreground">
                        <KindIcon className="w-3 h-3" />
                        {MONITOR_KIND_LABELS[monitor.kind]}
                    </span>
                </div>

                {/* Primary stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
                                        <Activity className="w-4 h-4" />
                                        Uptime 24h
                                    </span>
                                    <span
                                        className={cn(
                                            'font-mono font-medium',
                                            uptime24h === null
                                                ? 'text-muted-foreground'
                                                : uptime24h === 100
                                                    ? 'text-success'
                                                    : uptime24h >= 99
                                                        ? 'text-warning'
                                                        : 'text-destructive'
                                        )}
                                    >
                                        {formatUptime(uptime24h)}
                                    </span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all duration-500',
                                            uptime24h === null
                                                ? 'bg-muted-foreground/40'
                                                : uptime24h === 100
                                                    ? 'bg-success'
                                                    : uptime24h >= 99
                                                        ? 'bg-warning'
                                                        : 'bg-destructive'
                                        )}
                                        style={{ width: `${uptime24h ?? 0}%` }}
                                    />
                                </div>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {monitor.window_24h.checks} check{monitor.window_24h.checks === 1 ? '' : 's'} in 24h ·{' '}
                            {monitor.window_24h.down_checks} failed
                        </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
                                        <Gauge className="w-4 h-4" />
                                        Latency
                                    </span>
                                    <span className={cn('font-mono font-medium', latencyTone)}>
                                        {formatLatency(latency)}
                                    </span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                                    <div
                                        className={cn('h-full rounded-full transition-all duration-500', latencyBar)}
                                        style={{ width: `${latencyPercent}%` }}
                                    />
                                </div>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            Last {formatLatency(monitor.last_latency_ms)} · degraded above{' '}
                            {formatLatency(monitor.degraded_ms)}
                        </TooltipContent>
                    </Tooltip>
                </div>

                {/* Extended stats */}
                <div className="grid grid-cols-1 min-[450px]:grid-cols-2 gap-x-4 gap-y-0.5 mb-3 text-xs">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 px-1 py-1">
                                <Clock className="w-3.5 h-3.5 shrink-0 text-info/80" />
                                <span className="text-muted-foreground">Checked</span>
                                <span className="ml-auto font-mono text-foreground">
                                    {formatRelativeTime(monitor.last_checked_at)}
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {monitor.last_checked_at
                                ? new Date(monitor.last_checked_at).toLocaleString()
                                : 'Not checked yet'}
                        </TooltipContent>
                    </Tooltip>
                    <div className="flex items-center gap-2 px-1 py-1">
                        <Timer className="w-3.5 h-3.5 shrink-0 text-accent/80" />
                        <span className="text-muted-foreground">Every</span>
                        <span className="ml-auto font-mono text-foreground">
                            {formatInterval(monitor.interval_secs)}
                        </span>
                    </div>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 px-1 py-1">
                                <Activity className="w-3.5 h-3.5 shrink-0 text-violet/80" />
                                <span className="text-muted-foreground">30d</span>
                                <span className="ml-auto font-mono text-foreground">
                                    {formatUptime(monitor.window_30d.uptime_pct)}
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            7d {formatUptime(monitor.window_7d.uptime_pct)} · 30d{' '}
                            {formatUptime(monitor.window_30d.uptime_pct)}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 px-1 py-1">
                                <CalendarClock
                                    className={cn(
                                        'w-3.5 h-3.5 shrink-0',
                                        expirySoon ? 'text-warning' : 'text-warning/80'
                                    )}
                                />
                                <span className="text-muted-foreground">Expires</span>
                                <span
                                    className={cn(
                                        'ml-auto font-mono',
                                        expirySoon ? 'text-warning' : 'text-foreground'
                                    )}
                                >
                                    {expiry ? `${expiry.days}d` : '—'}
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {expiry
                                ? `${expiry.kind === 'certificate' ? 'Certificate' : 'Registration'} valid until ${formatDate(expiry.at)}`
                                : 'This monitor kind does not track an expiry date'}
                        </TooltipContent>
                    </Tooltip>
                </div>

                {/* Where the target resolves to. Opens the monitor's detail
                    dialog, which carries the interactive map — same click target
                    as the monitor name, so the card has one way in. */}
                {plottable ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <LocationStrip
                                location={monitor.location}
                                active={status === 'up' || status === 'degraded'}
                                subject={`${monitor.name} target`}
                                onClick={() => onOpen(monitor)}
                                className="mb-3"
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            Target resolves to {targetLocation || 'an unknown location'}
                            {monitor.location?.asn_org ? <><br />Network: {monitor.location.asn_org}</> : null}
                            {monitor.location?.ip ? <><br />Address: {monitor.location.ip}</> : null}
                        </TooltipContent>
                    </Tooltip>
                ) : null}

                <div className="flex items-center justify-between text-xs text-muted-foreground px-1 mb-4 pt-3 border-t border-border/50">
                    <span className="truncate text-muted-foreground/60">
                        {monitor.last_error ?? (monitor.last_checked_at ? 'No errors reported' : 'Awaiting first check')}
                    </span>
                    <span className={cn('ml-2 shrink-0 font-medium', statusStyle.text)}>{statusStyle.label}</span>
                </div>

                {/* 30-day history */}
                <div className="mt-auto">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Last 30 days</span>
                        <span className="font-mono text-[11px] text-muted-foreground/70">
                            {monitor.window_30d.checks} checks
                        </span>
                    </div>
                    <UptimeStrip daily={monitor.daily} />
                </div>
            </div>
        </div>
    );
}
