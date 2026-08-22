'use client';

import {
    Activity,
    Cpu,
    Globe,
    MoreVertical,
    Network,
    PauseCircle,
    PlayCircle,
    Radio,
    RefreshCw,
    Server,
    Users,
} from 'lucide-react';

import { LocationStrip } from '@/components/LocationStrip';
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
import { cn } from '@/lib/utils';
import { hasCoordinates } from '@/lib/geo';
import type { ServerInstance } from '@/types/server';

import {
    SERVER_STATUS_STYLES,
    formatBytes,
    formatRelativeTime,
    formatUptime,
    isServing,
    memoryPercent,
} from './server-display';

interface ServerCardProps {
    server: ServerInstance;
    /** Newest version in the fleet; anything behind it is flagged. */
    latestVersion: string;
    /** False for roles without `servers:manage`; management actions are hidden. */
    canManage: boolean;
    onOpen: (server: ServerInstance) => void;
    onToggleDrain: (server: ServerInstance) => void;
    onViewNodes: (server: ServerInstance) => void;
}

export function ServerCard({
    server,
    latestVersion,
    canManage,
    onOpen,
    onToggleDrain,
    onViewNodes,
}: ServerCardProps) {
    const statusStyle = SERVER_STATUS_STYLES[server.status];
    const serving = isServing(server);
    const memory = memoryPercent(server);
    const behindVersion = !!latestVersion && server.version !== latestVersion;
    const plottable = hasCoordinates(server.location);

    return (
        <div className="@container relative overflow-hidden rounded-xl md:overflow-visible">
            <div
                className={cn(
                    'group gradient-card mac-squircle border border-hairline rounded-xl p-5 relative h-full flex flex-col',
                    'transition-transform duration-300',
                    'hover:border-hairline-strong hover:shadow-window-raised',
                    server.status === 'offline' && 'opacity-70'
                )}
            >
                {/* Header */}
                <div className="relative z-30 flex items-start gap-3">
                    <span
                        aria-hidden
                        className={cn(
                            'mt-[7px] h-3 w-3 shrink-0 rounded-full',
                            statusStyle.dot,
                            server.status === 'online' && 'animate-pulse-glow text-success'
                        )}
                    />
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                            <button
                                type="button"
                                onClick={() => onOpen(server)}
                                className="min-w-0 truncate rounded text-left font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45"
                            >
                                {server.fqdn}
                            </button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 rounded-full border border-transparent text-muted-foreground transition-colors hover:border-hairline hover:bg-secondary/60 hover:text-foreground"
                                        aria-label={`Open actions for ${server.fqdn}`}
                                    >
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    className="w-56 rounded-xl border-hairline bg-popover/95 p-2 shadow-xl backdrop-blur"
                                >
                                    <DropdownMenuLabel className="px-2 py-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-medium text-muted-foreground">
                                                Server
                                            </span>
                                            <span className={cn('text-[11px] font-medium', statusStyle.text)}>
                                                {statusStyle.label}
                                            </span>
                                        </div>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => onOpen(server)}>
                                        <Server className="mr-2 h-4 w-4" />
                                        Instance details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onViewNodes(server)}>
                                        <Network className="mr-2 h-4 w-4" />
                                        Nodes on this server
                                    </DropdownMenuItem>
                                    {/* Management actions appear only for roles that
                                        hold `servers:manage`; see src/lib/rbac.ts. */}
                                    {canManage ? (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => onToggleDrain(server)}
                                                disabled={server.status === 'offline'}
                                            >
                                                {server.status === 'draining' ? (
                                                    <PlayCircle className="mr-2 h-4 w-4" />
                                                ) : (
                                                    <PauseCircle className="mr-2 h-4 w-4" />
                                                )}
                                                {server.status === 'draining' ? 'Resume traffic' : 'Drain traffic'}
                                            </DropdownMenuItem>
                                        </>
                                    ) : null}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        {server.status === 'draining' ? (
                            <p className="flex items-center gap-1.5 text-xs text-info">
                                <PauseCircle className="h-3 w-3 shrink-0" />
                                Draining — finishing existing sessions, taking no new nodes
                            </p>
                        ) : server.status === 'stale' ? (
                            <p className="flex items-center gap-1.5 text-xs text-warning">
                                <RefreshCw className="h-3 w-3 shrink-0" />
                                No keepalive for {formatRelativeTime(server.last_seen_at)}
                            </p>
                        ) : null}
                    </div>
                </div>

                {/* Identity */}
                <div className="mb-4 mt-1 flex min-w-0 items-center gap-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                                {server.public_ip}:{server.port}
                            </p>
                        </TooltipTrigger>
                        <TooltipContent>
                            Public {server.public_ip}
                            <br />
                            Private {server.private_ip}
                            <br />
                            Host {server.host_name}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span
                                className={cn(
                                    'flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-xs',
                                    behindVersion
                                        ? 'bg-warning/10 text-warning'
                                        : 'bg-secondary text-muted-foreground'
                                )}
                            >
                                <Radio className="h-3 w-3" />
                                {server.version}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {behindVersion
                                ? `Behind the fleet — ${latestVersion} is running elsewhere`
                                : 'Running the newest version in the fleet'}
                        </TooltipContent>
                    </Tooltip>
                </div>

                {/* Load */}
                <div className="mb-4 grid grid-cols-2 gap-3">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                        <Cpu className="h-4 w-4" />
                                        CPU
                                    </span>
                                    <span className="font-mono font-medium text-foreground">
                                        {server.cpu_percent === null ? '—' : `${server.cpu_percent.toFixed(1)}%`}
                                    </span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all duration-500',
                                            (server.cpu_percent ?? 0) >= 80 ? 'bg-destructive'
                                                : (server.cpu_percent ?? 0) >= 60 ? 'bg-warning' : 'bg-accent'
                                        )}
                                        style={{ width: `${server.cpu_percent ?? 0}%` }}
                                    />
                                </div>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {server.load_average
                                ? `Load ${server.load_average.map((v) => v.toFixed(2)).join(' / ')}`
                                : 'No sample from this instance'}
                        </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                        <Activity className="h-4 w-4" />
                                        Memory
                                    </span>
                                    <span className="font-mono font-medium text-foreground">
                                        {server.mem_total_bytes === null ? '—' : `${memory.toFixed(1)}%`}
                                    </span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all duration-500',
                                            memory >= 85 ? 'bg-destructive' : memory >= 70 ? 'bg-warning' : 'bg-accent'
                                        )}
                                        style={{ width: `${memory}%` }}
                                    />
                                </div>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {formatBytes(server.mem_used_bytes)} / {formatBytes(server.mem_total_bytes)}
                        </TooltipContent>
                    </Tooltip>
                </div>

                {/* Fleet counts */}
                <div className="mb-3 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs min-[450px]:grid-cols-2">
                    <div className="flex items-center gap-2 px-1 py-1">
                        <Network className="h-3.5 w-3.5 shrink-0 text-accent/80" />
                        <span className="text-muted-foreground">Nodes</span>
                        <span className="ml-auto font-mono text-foreground">{server.nodes}</span>
                    </div>
                    <div className="flex items-center gap-2 px-1 py-1">
                        <Users className="h-3.5 w-3.5 shrink-0 text-info/80" />
                        <span className="text-muted-foreground">Clients</span>
                        <span className="ml-auto font-mono text-foreground">{server.connections}</span>
                    </div>
                    <div className="flex items-center gap-2 px-1 py-1">
                        <Globe className="h-3.5 w-3.5 shrink-0 text-violet/80" />
                        <span className="text-muted-foreground">Sessions</span>
                        <span className="ml-auto font-mono text-foreground">{server.sessions}</span>
                    </div>
                    <div className="flex items-center gap-2 px-1 py-1">
                        <Radio className="h-3.5 w-3.5 shrink-0 text-warning/80" />
                        <span className="text-muted-foreground">Uptime</span>
                        <span className="ml-auto font-mono text-foreground">
                            {formatUptime(server.uptime_secs)}
                        </span>
                    </div>
                </div>

                {plottable ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <LocationStrip
                                location={server.location}
                                active={serving}
                                subject={`${server.fqdn} location`}
                                onClick={() => onOpen(server)}
                                className="mb-3"
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            {server.location?.asn_org ?? 'Unknown network'}
                            <br />
                            Public address {server.public_ip}
                        </TooltipContent>
                    </Tooltip>
                ) : null}

                <div className="mt-auto flex items-center justify-between border-t border-hairline px-1 pt-3 text-xs text-muted-foreground">
                    <span className="truncate text-muted-foreground/60">
                        Last keepalive {formatRelativeTime(server.last_seen_at)}
                    </span>
                    <span className={cn('ml-2 shrink-0 font-medium', statusStyle.text)}>
                        {statusStyle.label}
                    </span>
                </div>
            </div>
        </div>
    );
}
