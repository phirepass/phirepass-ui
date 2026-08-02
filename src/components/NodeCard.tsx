import { useRef } from 'react';
import { TunnelNode } from '@/types/node';
import { StatusIndicator } from './StatusIndicator';
import { StatBar } from './StatBar';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import {
    Globe,
    Lock,
    Terminal,
    FolderOpen,
    MonitorPlay,
    Clock,
    Activity,
    Cpu,
    Users,
    Share2,
    MoreVertical,
    Pencil,
    Trash2,
    Plus,
    Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const MIN_COMPATIBLE_AGENT_VERSION = '0.1.278';

function compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map((part) => parseInt(part, 10) || 0);
    const partsB = b.split('.').map((part) => parseInt(part, 10) || 0);
    const length = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < length; i++) {
        const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
        if (diff !== 0) return diff;
    }

    return 0;
}

type ListedService = { id: string; name: string | null; visibility: 'public' | 'private' };

/**
 * One hue per service kind, so a card can be read at a glance without parsing
 * labels. Written out in full because Tailwind cannot resolve class names built
 * at runtime. Unconfigured kinds deliberately opt out of all of this and stay
 * muted — colour is what tells you a service actually exists.
 */
const SERVICE_TINTS = {
    SSH: {
        icon: 'text-accent',
        count: 'text-accent',
        tile: 'border-accent/35 bg-accent/10 hover:border-accent/70 hover:bg-accent/20',
    },
    SFTP: {
        icon: 'text-info',
        count: 'text-info',
        tile: 'border-info/35 bg-info/10 hover:border-info/70 hover:bg-info/20',
    },
    RDP: {
        icon: 'text-violet',
        count: 'text-violet',
        tile: 'border-violet/35 bg-violet/10 hover:border-violet/70 hover:bg-violet/20',
    },
    HTTP: {
        icon: 'text-warning',
        count: 'text-warning',
        tile: 'border-warning/35 bg-warning/10 hover:border-warning/70 hover:bg-warning/20',
    },
} as const;

interface NodeCardProps {
    node: TunnelNode;
    onCreateTunnel: (node: TunnelNode, serviceId: string, serviceName?: string | null) => void;
    onOpenFiles: (node: TunnelNode, serviceId: string, serviceName?: string | null) => void;
    onOpenScreen: (node: TunnelNode, serviceId: string, serviceName?: string | null) => void;
    onReboot?: (node: TunnelNode) => void;
    onShutdown?: (node: TunnelNode) => void;
    onRefreshStats?: (node: TunnelNode) => void;
    onConfigure?: (node: TunnelNode) => void;
    onShare?: (node: TunnelNode) => void;
    onViewNodeId?: (node: TunnelNode) => void;
    onRename?: (node: TunnelNode) => void;
    onDelete?: (node: TunnelNode) => void;
    onEnableSsh?: () => void;
    onDisableSsh?: (serviceId: string) => void;
    onEditSsh?: (serviceId: string) => void;
    onEnableSftp?: () => void;
    onDisableSftp?: (serviceId: string) => void;
    onEditSftp?: (serviceId: string) => void;
    onEnableHttpProxy?: () => void;
    onDisableHttpProxy?: (serviceId: string) => void;
    onEditHttpProxy?: (serviceId: string) => void;
    onEnableRdp?: () => void;
    onDisableRdp?: (serviceId: string) => void;
    onEditRdp?: (serviceId: string) => void;
    // Fetches the real list of configured services for a kind (id, name, visibility),
    // used to populate the service instance picker with actual identifiable entries.
    onListServices?: (kind: 'ssh' | 'sftp' | 'http' | 'rdp') => Promise<ListedService[]>;
    isShared?: boolean;
    sharedBy?: string;
    // True while the node's data may be stale (e.g. rendered from a local cache before
    // the first live API response of this page load). Keeps the action buttons from
    // acting on possibly-outdated service state.
    actionsDisabled?: boolean;
}

import { useState } from 'react';

export function NodeCard({
    node,
    onCreateTunnel,
    onOpenFiles,
    onOpenScreen,
    onReboot,
    onShutdown,
    onRefreshStats,
    onConfigure,
    onShare,
    onViewNodeId,
    onRename,
    onDelete,
    onEnableSsh,
    onDisableSsh,
    onEditSsh,
    onEnableSftp,
    onDisableSftp,
    onEditSftp,
    onEnableHttpProxy,
    onDisableHttpProxy,
    onEditHttpProxy,
    onEnableRdp,
    onDisableRdp,
    onEditRdp,
    onListServices,
    isShared = false,
    sharedBy,
    actionsDisabled = false,
}: NodeCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);

    const formatDuration = (totalSeconds: number) => {
        const seconds = Math.max(0, Math.floor(totalSeconds));
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ${minutes % 60}m`;
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`;
    };

    const formatBytes = (bytes: number) => {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const unitIndex = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
        const value = bytes / Math.pow(1024, unitIndex);
        return `${value.toFixed(value < 10 ? 2 : value < 100 ? 1 : 0)} ${units[unitIndex]}`;
    };

    const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
    const showConnectedLoader = node.is_online && node.connected_for_secs < 60;
    const memoryPercent = node.stats.host_mem_total_bytes
        ? clampPercent((node.stats.host_mem_used_bytes / node.stats.host_mem_total_bytes) * 100)
        : 0;
    const cpuPercent = clampPercent(node.stats.host_cpu);
    const loadAverageLabel = node.stats.host_load_average.map((value) => value.toFixed(2)).join(' / ');
    const freeMemoryBytes = Math.max(0, node.stats.host_mem_total_bytes - node.stats.host_mem_used_bytes);
    const nodeVersion = node.stats.version?.trim();
    const isIncompatible = node.is_online
        && !!nodeVersion
        && compareVersions(nodeVersion, MIN_COMPATIBLE_AGENT_VERSION) < 0;
    const displayIp = (node.ip || node.stats.ip || node.stats.host_ip || '').trim();
    const displayLocalIp = (node.stats.host_local_ip || '').trim();
    const toServiceSummary = (summary: TunnelNode['services'][string]): { count: number; visibility: 'public' | 'private' } => (
        typeof summary === 'number' ? { count: summary, visibility: 'private' } : { count: summary.count, visibility: summary.visibility }
    );
    const normalizeServiceName = (service: string) => service.trim().toUpperCase().replace(/[\s_-]+/g, '');
    const matchingServices = (kind: string) => Object.entries(node.services ?? {})
        .filter(([service]) => normalizeServiceName(service) === kind)
        .map(([, summary]) => toServiceSummary(summary));
    const serviceCount = (kind: string) => matchingServices(kind)
        .reduce((sum, summary) => sum + summary.count, 0);
    const httpProxyVisibility = matchingServices('HTTP')
        .some((summary) => summary.visibility === 'public') ? 'public' : 'private';
    const HttpProxyIcon = httpProxyVisibility === 'public' ? Globe : Lock;
    const totalServiceCount = (['SSH', 'SFTP', 'RDP', 'HTTP'] as const)
        .reduce((sum, kind) => sum + serviceCount(kind), 0);

    const [ipBlurred, setIpBlurred] = useState(false);

    // SSH Modal State
    const [sshDialogOpen, setSshDialogOpen] = useState(false);
    const [sshHost, setSshHost] = useState('0.0.0.0');
    const [sshPort, setSshPort] = useState('22');
    const [sshUsername, setSshUsername] = useState('');
    const [sshPassword, setSshPassword] = useState('');

    // Service instance picker — always shown when connecting/opening a service,
    // listing every real configured instance of that kind (fetched by id/name via
    // onListServices). The backend currently only supports a single instance per
    // kind per node, so today this always lists at most one entry, but it's
    // wired up with real ids/names for when multi-instance services land.
    const [serviceInstancePicker, setServiceInstancePicker] = useState<{
        kind: 'SSH' | 'SFTP' | 'HTTP' | 'RDP';
        loading: boolean;
        instances: ListedService[];
    } | null>(null);

    const runOrPickInstance = async (kind: 'SSH' | 'SFTP' | 'HTTP' | 'RDP') => {
        setServiceInstancePicker({ kind, loading: true, instances: [] });
        const instances = (await onListServices?.(kind.toLowerCase() as 'ssh' | 'sftp' | 'http' | 'rdp')) ?? [];
        setServiceInstancePicker({ kind, loading: false, instances });
    };

    const selectServiceInstance = (action: () => void) => {
        setServiceInstancePicker(null);
        action();
    };

    // Only one HTTP proxy is allowed per node; SSH/SFTP have no such limit.
    const httpLimitReached = serviceInstancePicker?.kind === 'HTTP'
        && !serviceInstancePicker.loading
        && serviceInstancePicker.instances.length >= 1;

    const serviceInstanceLabel = (kind: 'SSH' | 'SFTP' | 'HTTP' | 'RDP') => (
        kind === 'SSH' ? 'SSH session' : kind === 'SFTP' ? 'SFTP session' : kind === 'RDP' ? 'RDP screen' : 'HTTP service'
    );

    // Same icon as the SSH/Files/Screen/HTTP action buttons; for HTTP it follows this
    // specific instance's visibility (Globe for public, Lock for private), same as
    // the aggregate HttpProxyIcon does for the card-level button.
    const serviceInstanceIcon = (kind: 'SSH' | 'SFTP' | 'HTTP' | 'RDP', instance: ListedService) => (
        kind === 'SSH' ? Terminal : kind === 'SFTP' ? FolderOpen : kind === 'RDP' ? MonitorPlay : (instance.visibility === 'public' ? Globe : Lock)
    );

    const triggerEnableService = (kind: 'SSH' | 'SFTP' | 'HTTP' | 'RDP') => {
        if (kind === 'SSH') onEnableSsh?.();
        else if (kind === 'SFTP') onEnableSftp?.();
        else if (kind === 'RDP') onEnableRdp?.();
        else onEnableHttpProxy?.();
    };

    const triggerDisableService = (kind: 'SSH' | 'SFTP' | 'HTTP' | 'RDP', serviceId: string) => {
        if (kind === 'SSH') onDisableSsh?.(serviceId);
        else if (kind === 'SFTP') onDisableSftp?.(serviceId);
        else if (kind === 'RDP') onDisableRdp?.(serviceId);
        else onDisableHttpProxy?.(serviceId);
    };

    const triggerEditService = (kind: 'SSH' | 'SFTP' | 'HTTP' | 'RDP', serviceId: string) => {
        if (kind === 'SSH') onEditSsh?.(serviceId);
        else if (kind === 'SFTP') onEditSftp?.(serviceId);
        else if (kind === 'RDP') onEditRdp?.(serviceId);
        else onEditHttpProxy?.(serviceId);
    };

    return (
        <div className="@container relative overflow-hidden rounded-xl md:overflow-visible">
            {/* Main Card */}
            <div
                ref={cardRef}
                className={cn(
                    'group gradient-card border rounded-xl p-5 bg-card relative h-full flex flex-col',
                    'hover:border-primary/50 hover:shadow-[0_0_30px_hsl(var(--primary)/0.1)]',
                    'border-border',
                    'transition-transform duration-300',
                    (!node.is_online || isIncompatible) && 'select-none'
                )}
            >
                {(!node.is_online || isIncompatible) && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-background/45 backdrop-blur-sm">
                        <div className={cn(
                            'flex items-center gap-2 rounded-full border bg-card/90 px-3 py-1.5 text-sm font-medium shadow-sm select-none',
                            isIncompatible
                                ? 'border-orange-400/35 text-orange-500'
                                : 'border-red-400/35 text-red-500'
                        )}>
                            <span>{isIncompatible ? 'Incompatible' : 'Offline'}</span>
                        </div>
                    </div>
                )}
                {showConnectedLoader && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-background/45 backdrop-blur-sm">
                        <div className="flex items-center gap-2 rounded-full border border-primary/35 bg-card/90 px-3 py-1.5 text-sm font-medium text-primary shadow-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Connecting...</span>
                        </div>
                    </div>
                )}
                {/* Header */}
                <div className="relative z-30 flex items-start">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Selection checkbox removed */}
                        <StatusIndicator isOnline={node.is_online} size="md" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 min-w-0">
                                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                                    {node.name}
                                </h3>
                                <div className="relative z-30 flex items-center gap-2 flex-shrink-0">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary/60 hover:text-foreground"
                                                aria-label={`Open actions for ${node.name}`}
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
                                                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Node actions</span>
                                                    <span className={cn(
                                                        'text-[11px] font-medium',
                                                        isIncompatible
                                                            ? 'text-orange-500'
                                                            : node.is_online ? 'text-emerald-500' : 'text-red-500'
                                                    )}>
                                                        {isIncompatible ? 'Incompatible' : node.is_online ? 'Online' : 'Offline'}
                                                    </span>
                                                </div>
                                            </DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => onViewNodeId?.(node)}>
                                                <Globe className="mr-2 w-4 h-4" />
                                                View Node ID
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => onRename?.(node)}>
                                                <Pencil className="mr-2 w-4 h-4" />
                                                Rename Node
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => onDelete?.(node)}
                                                className="text-destructive focus:text-destructive"
                                            >
                                                <Trash2 className="mr-2 w-4 h-4" />
                                                Delete Node
                                            </DropdownMenuItem>
                                            {/* SSH Modal handled by parent */}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                            {isShared && sharedBy ? (
                                <p className="text-xs text-accent truncate">
                                    <span className="bg-accent/20 px-1.5 py-0.5 rounded mr-1">Shared</span>
                                    by {sharedBy}
                                </p>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 mb-4 mt-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs text-muted-foreground font-mono block truncate">
                                        {node.stats.host_name?.trim() || 'Hostname unavailable'}
                                    </p>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                MAC {node.stats.host_mac}
                            </TooltipContent>
                        </Tooltip>
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded whitespace-nowrap">
                            {node.is_online ? node.stats.host_os_info : 'Unknown'}
                        </span>
                    </div>
                </div>

                {/* Primary Stats - Side by Side */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div>
                                <StatBar label="CPU" value={cpuPercent} icon={<Cpu className="w-4 h-4" />} />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            Host CPU: {node.stats.host_cpu.toFixed(2)}%
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div>
                                <StatBar label="Memory" value={memoryPercent} icon={<Activity className="w-4 h-4" />} />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {formatBytes(node.stats.host_mem_used_bytes)} / {formatBytes(node.stats.host_mem_total_bytes)} • Free {formatBytes(freeMemoryBytes)}
                        </TooltipContent>
                    </Tooltip>
                </div>

                {/* Extended Stats Grid */}
                <div className="grid grid-cols-1 min-[450px]:grid-cols-2 gap-x-4 gap-y-0.5 mb-3 text-xs">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 px-1 py-1">
                                <Clock className="w-3.5 h-3.5 shrink-0 text-info/80" />
                                <span className="text-muted-foreground">Uptime</span>
                                <span className="ml-auto font-mono text-foreground">{formatDuration(node.stats.host_uptime_secs)}</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {node.stats.host_uptime_secs}s
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div
                                className="flex items-center gap-2 px-1 py-1 cursor-pointer"
                                onDoubleClick={() => setIpBlurred((blurred) => !blurred)}
                            >
                                <Globe className="w-3.5 h-3.5 shrink-0 text-accent/80" />
                                <span className="text-muted-foreground shrink-0">IP</span>
                                <span className={cn('ml-auto min-w-0 font-mono text-foreground truncate', ipBlurred && 'blur-sm select-none')}>
                                    {displayIp || 'unknown'}
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            Public: {ipBlurred ? '••••••••' : (displayIp || 'IP unavailable')}
                            <br />
                            Local: {ipBlurred ? '••••••••' : (displayLocalIp || 'IP unavailable')}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 px-1 py-1">
                                <Activity className="w-3.5 h-3.5 shrink-0 text-warning/80" />
                                <span className="text-muted-foreground">Load</span>
                                <span className="ml-auto font-mono text-foreground">{node.stats.host_load_average[0].toFixed(2)}</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {loadAverageLabel}
                        </TooltipContent>
                    </Tooltip>
                    <div className="flex items-center gap-2 px-1 py-1">
                        <Cpu className="w-3.5 h-3.5 shrink-0 text-violet/80" />
                        <span className="text-muted-foreground">Procs</span>
                        <span className="ml-auto font-mono text-foreground">{node.stats.host_processes}</span>
                    </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground px-1 mb-4 pt-3 border-t border-border/50">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="text-muted-foreground/60">
                                Connected: {formatDuration(node.connected_for_secs)}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            Connected for {node.connected_for_secs}s
                        </TooltipContent>
                    </Tooltip>
                    <span className="text-muted-foreground/70">Version: {nodeVersion || 'unknown'}</span>
                </div>

                {/* Services — the card's primary affordance. Configured kinds carry a
                    count; unconfigured ones stay muted with a + so the card doubles
                    as the place you add them. */}
                <div className="mt-auto">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Services</span>
                        {totalServiceCount > 0 ? (
                            <span className="font-mono text-[11px] text-muted-foreground/70">{totalServiceCount} configured</span>
                        ) : null}
                    </div>
                    <div className="grid grid-cols-1 min-[450px]:grid-cols-2 gap-2">
                        {([
                            { kind: 'SSH' as const, label: 'SSH', Icon: Terminal },
                            { kind: 'SFTP' as const, label: 'Files', Icon: FolderOpen },
                            { kind: 'RDP' as const, label: 'Screen', Icon: MonitorPlay },
                            { kind: 'HTTP' as const, label: 'HTTP', Icon: HttpProxyIcon },
                        ]).map(({ kind, label, Icon }) => {
                            const count = serviceCount(kind);
                            const configured = count > 0;
                            const tint = SERVICE_TINTS[kind];

                            return (
                                <Tooltip key={kind}>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            onClick={() => void runOrPickInstance(kind)}
                                            disabled={actionsDisabled}
                                            aria-label={configured
                                                ? `Open ${label} on ${node.name}`
                                                : `Add a ${label} service to ${node.name}`}
                                            className={cn(
                                                'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                'disabled:cursor-not-allowed disabled:opacity-50',
                                                configured
                                                    ? tint.tile
                                                    : 'border-dashed border-border/60 hover:border-border hover:bg-secondary/30'
                                            )}
                                        >
                                            <Icon className={cn(
                                                'w-4 h-4 shrink-0',
                                                configured ? tint.icon : 'text-muted-foreground/60'
                                            )} />
                                            <span className={cn(
                                                'flex-1 truncate text-xs font-medium',
                                                configured ? 'text-foreground' : 'text-muted-foreground'
                                            )}>
                                                {label}
                                            </span>
                                            {configured ? (
                                                <span className={cn('font-mono text-xs font-semibold', tint.count)}>{count}</span>
                                            ) : (
                                                <Plus className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
                                            )}
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {configured
                                            ? `${count} ${label} ${count === 1 ? 'service' : 'services'}`
                                            : `No ${label} service yet - click to add one`}
                                    </TooltipContent>
                                </Tooltip>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Service instance picker */}
            <Dialog open={!!serviceInstancePicker} onOpenChange={(open) => !open && setServiceInstancePicker(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {serviceInstancePicker ? `Select ${serviceInstanceLabel(serviceInstancePicker.kind)}` : ''}
                        </DialogTitle>
                        <DialogDescription>
                            Choose which instance to connect to, edit, or delete.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        {serviceInstancePicker?.loading ? (
                            <p className="text-sm text-muted-foreground">Loading...</p>
                        ) : null}
                        {serviceInstancePicker && !serviceInstancePicker.loading && serviceInstancePicker.instances.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No {serviceInstanceLabel(serviceInstancePicker.kind)} configured yet.
                            </p>
                        ) : null}
                        {!serviceInstancePicker?.loading && serviceInstancePicker?.instances.map((instance) => {
                            const InstanceIcon = serviceInstanceIcon(serviceInstancePicker.kind, instance);
                            const displayName = instance.name?.trim() || `${serviceInstanceLabel(serviceInstancePicker.kind)} ${instance.id.slice(0, 8)}`;
                            return (
                            <div key={instance.id} className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    className="flex-1 justify-between"
                                    onClick={() => selectServiceInstance(() => {
                                        const kind = serviceInstancePicker.kind;
                                        if (kind === 'SSH') onCreateTunnel(node, instance.id, instance.name);
                                        else if (kind === 'SFTP') onOpenFiles(node, instance.id, instance.name);
                                        else if (kind === 'RDP') onOpenScreen(node, instance.id, instance.name);
                                        else window.open(`https://${node.id}.http.proxy.phirepass.com`, '_blank');
                                    })}
                                >
                                    <span className="flex items-center gap-2">
                                        <InstanceIcon className="w-4 h-4" />
                                        {displayName}
                                    </span>
                                    {serviceInstancePicker.kind === 'HTTP' ? (
                                        <span className="text-xs text-muted-foreground capitalize">{instance.visibility}</span>
                                    ) : null}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Edit ${displayName}`}
                                    onClick={() => selectServiceInstance(() => triggerEditService(serviceInstancePicker.kind, instance.id))}
                                >
                                    <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    aria-label={`Delete ${displayName}`}
                                    onClick={() => selectServiceInstance(() => triggerDisableService(serviceInstancePicker.kind, instance.id))}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                            );
                        })}
                    </div>
                    <DialogFooter className="flex-col items-stretch gap-1.5 sm:flex-col">
                        <Button
                            variant="outline"
                            className="w-full gap-2"
                            onClick={() => selectServiceInstance(() => triggerEnableService(serviceInstancePicker!.kind))}
                            disabled={httpLimitReached}
                        >
                            <Plus className="w-4 h-4" />
                            Add {serviceInstancePicker ? serviceInstanceLabel(serviceInstancePicker.kind) : ''}
                        </Button>
                        {httpLimitReached ? (
                            <p className="text-xs text-muted-foreground text-center">
                                Only one HTTP service is allowed per node.
                            </p>
                        ) : null}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
