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

interface NodeCardProps {
    node: TunnelNode;
    onCreateTunnel: (node: TunnelNode, serviceId: string, serviceName?: string | null) => void;
    onOpenFiles: (node: TunnelNode, serviceId: string, serviceName?: string | null) => void;
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
    // Fetches the real list of configured services for a kind (id, name, visibility),
    // used to populate the service instance picker with actual identifiable entries.
    onListServices?: (kind: 'ssh' | 'sftp' | 'http') => Promise<ListedService[]>;
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
        kind: 'SSH' | 'SFTP' | 'HTTP';
        loading: boolean;
        instances: ListedService[];
    } | null>(null);

    const runOrPickInstance = async (kind: 'SSH' | 'SFTP' | 'HTTP') => {
        setServiceInstancePicker({ kind, loading: true, instances: [] });
        const instances = (await onListServices?.(kind.toLowerCase() as 'ssh' | 'sftp' | 'http')) ?? [];
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

    const serviceInstanceLabel = (kind: 'SSH' | 'SFTP' | 'HTTP') => (
        kind === 'SSH' ? 'SSH session' : kind === 'SFTP' ? 'SFTP session' : 'HTTP service'
    );

    // Same icon as the Console/Files/HTTP action buttons; for HTTP it follows this
    // specific instance's visibility (Globe for public, Lock for private), same as
    // the aggregate HttpProxyIcon does for the card-level button.
    const serviceInstanceIcon = (kind: 'SSH' | 'SFTP' | 'HTTP', instance: ListedService) => (
        kind === 'SSH' ? Terminal : kind === 'SFTP' ? FolderOpen : (instance.visibility === 'public' ? Globe : Lock)
    );

    const triggerEnableService = (kind: 'SSH' | 'SFTP' | 'HTTP') => {
        if (kind === 'SSH') onEnableSsh?.();
        else if (kind === 'SFTP') onEnableSftp?.();
        else onEnableHttpProxy?.();
    };

    const triggerDisableService = (kind: 'SSH' | 'SFTP' | 'HTTP', serviceId: string) => {
        if (kind === 'SSH') onDisableSsh?.(serviceId);
        else if (kind === 'SFTP') onDisableSftp?.(serviceId);
        else onDisableHttpProxy?.(serviceId);
    };

    const triggerEditService = (kind: 'SSH' | 'SFTP' | 'HTTP', serviceId: string) => {
        if (kind === 'SSH') onEditSsh?.(serviceId);
        else if (kind === 'SFTP') onEditSftp?.(serviceId);
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

                <div className="flex items-center gap-3 mb-8 mt-1">
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
                <div className="grid grid-cols-1 min-[450px]:grid-cols-2 gap-2 mb-4 text-xs">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-3 bg-secondary/50 rounded-lg px-3 py-2.5">
                                <Clock className="w-5 h-5 text-primary" />
                                <div>
                                    <span className="text-muted-foreground">Uptime</span>
                                    <p className="font-mono text-foreground">{formatDuration(node.stats.host_uptime_secs)}</p>
                                </div>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {node.stats.host_uptime_secs}s
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-2 py-2">
                                <Globe className="w-4 h-4 text-primary shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-muted-foreground shrink-0">IP</span>
                                        <div className="min-w-0">
                                            <p className="font-mono text-foreground truncate">{displayIp || 'unknown'}</p>
                                            <p className="font-mono text-muted-foreground truncate">{displayLocalIp || 'unknown'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            Public: {displayIp || 'IP unavailable'}
                            <br />
                            Local: {displayLocalIp || 'IP unavailable'}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-3 bg-secondary/50 rounded-lg px-3 py-2.5">
                                <Activity className="w-5 h-5 text-accent" />
                                <div>
                                    <span className="text-muted-foreground">Load Avg</span>
                                    <p className="font-mono text-foreground">{node.stats.host_load_average[0].toFixed(2)}</p>
                                </div>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {loadAverageLabel}
                        </TooltipContent>
                    </Tooltip>
                    <div className="flex items-center gap-3 bg-secondary/50 rounded-lg px-3 py-2.5">
                        <Cpu className="w-5 h-5 text-accent" />
                        <div>
                            <span className="text-muted-foreground">Processes</span>
                            <p className="font-mono text-foreground">{node.stats.host_processes}</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground px-1 mb-4">
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

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                    {/*node.tags.map((tag) => (
                        <span
                            key={tag}
                            className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded"
                        >
                            {tag}
                        </span>
                    ))*/}
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 mt-auto">
                    <Button
                        variant="default"
                        size="sm"
                        className="flex-1 min-w-0 gap-1 px-2 text-xs whitespace-nowrap [&_svg]:size-3.5"
                        onClick={() => void runOrPickInstance('SSH')}
                        disabled={actionsDisabled}
                    >
                        <Terminal />
                        Console{serviceCount('SSH') > 0 ? <span className="font-mono"> [{serviceCount('SSH')}]</span> : ''}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-w-0 gap-1 px-2 text-xs whitespace-nowrap [&_svg]:size-3.5"
                        onClick={() => void runOrPickInstance('SFTP')}
                        disabled={actionsDisabled}
                    >
                        <FolderOpen />
                        Files{serviceCount('SFTP') > 0 ? <span className="font-mono"> [{serviceCount('SFTP')}]</span> : ''}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-w-0 gap-1 px-2 text-xs whitespace-nowrap [&_svg]:size-3.5"
                        onClick={() => void runOrPickInstance('HTTP')}
                        disabled={actionsDisabled}
                    >
                        <HttpProxyIcon />
                        HTTP{serviceCount('HTTP') > 0 ? <span className="font-mono"> [{serviceCount('HTTP')}]</span> : ''}
                    </Button>
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
