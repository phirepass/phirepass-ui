import { useState, useRef } from 'react';
import { TunnelNode } from '@/types/node';
import { StatusIndicator } from './StatusIndicator';
import { StatBar } from './StatBar';
import { Button } from './ui/button';
import {
    Globe,
    FolderOpen,
    Clock,
    Wifi,
    MoreVertical,
    Power,
    RefreshCw,
    Settings,
    Activity,
    Cpu,
    Users,
    Share2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";

interface NodeCardProps {
    node: TunnelNode;
    onCreateTunnel: (node: TunnelNode) => void;
    onOpenFiles: (node: TunnelNode) => void;
    onReboot?: (node: TunnelNode) => void;
    onShutdown?: (node: TunnelNode) => void;
    onRefreshStats?: (node: TunnelNode) => void;
    onConfigure?: (node: TunnelNode) => void;
    onShare?: (node: TunnelNode) => void;
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
    isSelected = false,
    onSelect,
    showSelection = false,
    isShared = false,
    sharedBy,
}: NodeCardProps) {
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    const SWIPE_THRESHOLD = 80;
    const MAX_SWIPE = 160;

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        setIsSwiping(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStartX.current === null || touchStartY.current === null) return;

        const deltaX = e.touches[0].clientX - touchStartX.current;
        const deltaY = e.touches[0].clientY - touchStartY.current;

        // If vertical scroll is dominant, don't swipe
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
            return;
        }

        // Clamp the swipe offset
        const newOffset = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, deltaX));
        setSwipeOffset(newOffset);
    };

    const handleTouchEnd = () => {
        setIsSwiping(false);

        // Trigger action if swiped past threshold
        if (swipeOffset > SWIPE_THRESHOLD/* && node.isOnline*/) {
            // Swipe right - Create tunnel
            onCreateTunnel(node);
        } else if (swipeOffset < -SWIPE_THRESHOLD && !isShared) {
            // Swipe left - Share
            onShare?.(node);
        }

        // Reset position
        setSwipeOffset(0);
        touchStartX.current = null;
        touchStartY.current = null;
    };

    const leftActionOpacity = Math.min(1, Math.abs(swipeOffset) / SWIPE_THRESHOLD);
    const rightActionOpacity = Math.min(1, Math.abs(swipeOffset) / SWIPE_THRESHOLD);

    return (
        <div className="relative overflow-hidden rounded-xl md:overflow-visible">
            {/* Left Action (Swipe Right to Create Tunnel) */}
            <div
                className={cn(
                    "absolute inset-y-0 left-0 w-40 flex items-center justify-center rounded-l-xl bg-primary md:hidden",
                    "transition-opacity duration-200"
                )}
                style={{ opacity: swipeOffset > 0 ? leftActionOpacity : 0 }}
            >
                <div className="flex flex-col items-center justify-center gap-2 text-primary-foreground">
                    <Globe className="w-10 h-10" />
                    <span className="text-sm font-semibold">Tunnel</span>
                </div>
            </div>

            {/* Right Action (Swipe Left to Share) */}
            <div
                className={cn(
                    "absolute inset-y-0 right-0 w-40 flex items-center justify-center rounded-r-xl bg-accent md:hidden",
                    "transition-opacity duration-200"
                )}
                style={{ opacity: swipeOffset < 0 ? rightActionOpacity : 0 }}
            >
                <div className="flex flex-col items-center justify-center gap-2 text-accent-foreground">
                    <Share2 className="w-10 h-10" />
                    <span className="text-sm font-semibold">Share</span>
                </div>
            </div>

            {/* Main Card */}
            <div
                ref={cardRef}
                className={cn(
                    'group gradient-card border rounded-xl p-5 bg-card relative h-full flex flex-col',
                    'hover:border-primary/50 hover:shadow-[0_0_30px_hsl(var(--primary)/0.1)]',
                    isSelected ? 'border-primary bg-primary/5' : 'border-border',
                    // !node.isOnline && 'opacity-60',
                    isSwiping ? '' : 'transition-transform duration-300'
                )}
                style={{
                    transform: `translateX(${swipeOffset}px)`,
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Swipe Hint for mobile */}
                {swipeOffset === 0 && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground/50 md:hidden pointer-events-none">
                        ← swipe →
                    </div>
                )}

                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        {showSelection && (
                            <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => onSelect?.(node, checked as boolean)}
                                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary flex-shrink-0"
                            />
                        )}
                        <StatusIndicator isOnline={/*node.isOnline*/ true } size="md" />
                        <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                                {node.stats.host_name}
                            </h3>
                            {isShared && sharedBy ? (
                                <p className="text-xs text-accent truncate">
                                    <span className="bg-accent/20 px-1.5 py-0.5 rounded mr-1">Shared</span>
                                    by {sharedBy}
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground font-mono">{node.ip}</p>
                            )}
                            {isShared && sharedBy && (
                                <p className="text-xs text-muted-foreground font-mono">{node.ip}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                            {node.stats.host_os_info}
                        </span>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-10 w-10 md:h-8 md:w-8">
                                    <MoreVertical className="w-5 h-5 md:w-4 md:h-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => onRefreshStats?.(node)} className="h-11 md:h-9">
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Refresh Stats
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onConfigure?.(node)} className="h-11 md:h-9">
                                    <Settings className="w-4 h-4 mr-2" />
                                    Configure
                                </DropdownMenuItem>
                                {!isShared && (
                                    <DropdownMenuItem onClick={() => onShare?.(node)} className="h-11 md:h-9">
                                        <Share2 className="w-4 h-4 mr-2" />
                                        Share
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => onReboot?.(node)}
                                    disabled={/*!node.isOnline*/ false}
                                    className="h-11 md:h-9"
                                >
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Reboot
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => onShutdown?.(node)}
                                    disabled={/*!node.isOnline*/ false}
                                    className="text-destructive focus:text-destructive h-11 md:h-9"
                                >
                                    <Power className="w-4 h-4 mr-2" />
                                    Shutdown
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Primary Stats - Side by Side */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <StatBar label="CPU" value={node.stats.host_cpu} icon={<Cpu className="w-4 h-4" />} />
                    <StatBar label="Memory" value={node.stats.host_mem_used_bytes} icon={<Activity className="w-4 h-4" />} />
                </div>

                {/* Extended Stats Grid */}
                <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                    <div className="flex items-center gap-3 bg-secondary/50 rounded-lg px-3 py-2.5">
                        <Clock className="w-5 h-5 text-primary" />
                        <div>
                            <span className="text-muted-foreground">Uptime</span>
                            <p className="font-mono text-foreground">{node.stats.host_uptime_secs}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 bg-secondary/50 rounded-lg px-3 py-2.5">
                        <Wifi className="w-5 h-5 text-primary" />
                        <div>
                            <span className="text-muted-foreground">Ping</span>
                            <p className="font-mono text-foreground">{node.connected_for_secs}ms</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 bg-secondary/50 rounded-lg px-3 py-2.5">
                        <Activity className="w-5 h-5 text-accent" />
                        <div>
                            <span className="text-muted-foreground">Load Avg</span>
                            <p className="font-mono text-foreground">{node.stats.host_load_average[0].toFixed(2)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 bg-secondary/50 rounded-lg px-3 py-2.5">
                        <Users className="w-5 h-5 text-accent" />
                        <div>
                            <span className="text-muted-foreground">Connections</span>
                            <p className="font-mono text-foreground">{node.stats.host_connections}</p>
                        </div>
                    </div>
                </div>

                {/* Processes count */}
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-4 px-1">
                    <span>{node.stats.host_processes} processes running</span>
                    <span className="text-muted-foreground/60">Last seen: {node.connected_for_secs}</span>
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
                        className="flex-1"
                        onClick={() => onCreateTunnel(node)}
                        disabled={/*!node.isOnline*/false}
                    >
                        <Globe className="w-4 h-4" />
                        Create Tunnel
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => onOpenFiles(node)}
                        disabled={/*!node.isOnline*/false}
                    >
                        <FolderOpen className="w-4 h-4" />
                        Files
                    </Button>
                </div>
            </div>
        </div>
    );
}
