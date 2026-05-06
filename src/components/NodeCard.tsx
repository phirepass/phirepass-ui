import { useRef } from 'react';
import { TunnelNode } from '@/types/node';
import { StatusIndicator } from './StatusIndicator';
import { StatBar } from './StatBar';
import { Button } from './ui/button';
import {
    Globe,
    FolderOpen,
    Clock,
    Wifi,
    Activity,
    Cpu,
    Users,
    Share2,
    MoreVertical,
    Pencil,
    Trash2,
    Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NodeCardProps {
    node: TunnelNode;
    onCreateTunnel: (node: TunnelNode) => void;
    onOpenFiles: (node: TunnelNode) => void;
    onReboot?: (node: TunnelNode) => void;
    onShutdown?: (node: TunnelNode) => void;
    onRefreshStats?: (node: TunnelNode) => void;
    onConfigure?: (node: TunnelNode) => void;
    onShare?: (node: TunnelNode) => void;
    onRename?: (node: TunnelNode) => void;
    onDelete?: (node: TunnelNode) => void;
    isSelected?: boolean;
    onSelect?: (node: TunnelNode, selected: boolean) => void;
    showSelection?: boolean;
    isShared?: boolean;
    sharedBy?: string;
}

export function NodeCard({
    node,
    onCreateTunnel,
    onOpenFiles,
    onReboot,
    onShutdown,
    onRefreshStats,
    onConfigure,
    onShare,
    onRename,
    onDelete,
    isSelected = false,
    onSelect,
    showSelection = false,
    isShared = false,
    sharedBy,
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
    const displayIp = (node.ip || node.stats.ip || node.stats.host_ip || '').trim();
    const displayLocalIp = (node.stats.host_local_ip || '').trim();
    const nodeServices = (node.services ?? []).filter((service) => service.trim().length > 0);
    const hasSsh = nodeServices.indexOf('SSH') !== -1;
    const hasSftp = nodeServices.indexOf('SFTP') !== -1;

    return (
        <div className="relative overflow-hidden rounded-xl md:overflow-visible">
            {/* Main Card */}
            <div
                ref={cardRef}
                className={cn(
                    'group gradient-card border rounded-xl p-5 bg-card relative h-full flex flex-col',
                    'hover:border-primary/50 hover:shadow-[0_0_30px_hsl(var(--primary)/0.1)]',
                    isSelected ? 'border-primary bg-primary/5' : 'border-border',
                    'transition-transform duration-300'
                )}
            >
                {!node.is_online && (
                    <div className="absolute inset-0 z-20 rounded-xl bg-background/40 backdrop-blur-[2px] pointer-events-none" />
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
                <div className="flex items-start">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        {showSelection && (
                            <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => onSelect?.(node, checked as boolean)}
                                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary flex-shrink-0"
                            />
                        )}
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
                                                className="h-8 w-8"
                                                aria-label={`Open actions for ${node.name}`}
                                            >
                                                <MoreVertical className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => onRename?.(node)}>
                                                <Pencil className="mr-2 w-4 h-4" />
                                                Rename node
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => onDelete?.(node)}
                                                className="text-destructive focus:text-destructive"
                                            >
                                                <Trash2 className="mr-2 w-4 h-4" />
                                                Delete node
                                            </DropdownMenuItem>
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
                                        {node.stats.host_name}
                                    </p>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                MAC {node.stats.host_mac}
                            </TooltipContent>
                        </Tooltip>
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded whitespace-nowrap">
                            {node.stats.host_os_info}
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
                <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
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
                            <div className="flex items-center gap-3 bg-secondary/50 rounded-lg px-3 py-2.5">
                                <Globe className="w-5 h-5 text-primary" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-muted-foreground">IP</span>
                                        <div className="min-w-0 text-right">
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
                <div className="flex gap-2 mt-auto">
                    <Button
                        variant="default"
                        size="sm"
                        className="flex-1 disabled:opacity-15"
                        onClick={() => onCreateTunnel(node)}
                        disabled={!node.is_online || !hasSsh}
                    >
                        <Globe className="w-4 h-4" />
                        Connect
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 disabled:opacity-15"
                        onClick={() => onOpenFiles(node)}
                        disabled={!node.is_online || !hasSftp}
                    >
                        <FolderOpen className="w-4 h-4" />
                        Files
                    </Button>
                </div>
            </div>
        </div>
    );
}
