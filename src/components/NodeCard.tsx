import { useState } from 'react';
import dynamic from 'next/dynamic';
import { TunnelNode } from '@/types/node';
import { LocationDetails } from './LocationDetails';
import { LanFingerprintDetails } from './LanFingerprintDetails';
import { DiskDetails } from './DiskDetails';
import {
    DISK_DANGER_PERCENT,
    DISK_WARN_PERCENT,
    displayedFilesystem,
    percentUsed,
} from './disk-display';
import { flagFromCountryCode, hasCoordinates, locationLabel } from '@/lib/geo';
import { StatusIndicator } from './StatusIndicator';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
    ChevronRight,
    Container as ContainerIcon,
    Eye,
    EyeOff,
    FolderOpen,
    Globe,
    Info,
    Lock,
    Loader2,
    MonitorPlay,
    MoreVertical,
    Pencil,
    Plus,
    Terminal,
    Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuSeparator,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * MapLibre is WebGL and ~250 KB gzipped, and every node card would otherwise
 * pull it into the initial bundle for a map that is only ever shown on demand.
 * Loaded client-side only: it touches `window` on construction, so it cannot be
 * server-rendered.
 */
const NodeLocationDetailMap = dynamic(
    () => import('./NodeLocationDetailMap').then((mod) => mod.NodeLocationDetailMap),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full w-full items-center justify-center bg-muted/30">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        ),
    }
);

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

type ListedService = { id: string; name: string | null };

/**
 * One hue per service kind, so a card can be read at a glance without parsing
 * labels. Written out in full because Tailwind cannot resolve class names built
 * at runtime. Unconfigured kinds deliberately opt out of all of this and stay
 * muted — colour is what tells you a service actually exists.
 */
const SERVICE_TINTS = {
    SSH: { icon: 'text-accent' },
    SFTP: { icon: 'text-info' },
    RDP: { icon: 'text-violet' },
    HTTP: { icon: 'text-warning' },
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
    // Fetches the real list of configured services for a kind (id, name),
    // used to populate the service instance picker with actual identifiable entries.
    onListServices?: (kind: 'ssh' | 'sftp' | 'http' | 'rdp') => Promise<ListedService[]>;
    isShared?: boolean;
    sharedBy?: string;
    /**
     * Whether this session may *configure* the node, as opposed to use it.
     *
     * The dashboard's copy of `nodeManageScope` — its owner, and whoever reaches
     * the whole workspace. It is not the negation of `isShared`: an organisation
     * admin looking at a colleague's machine sees the "Shared" badge and may
     * still rename, delete and edit it.
     *
     * Everything it gates would be refused anyway — by `nodeManageScope` on the
     * dashboard's routes and by `may_configure` on the server, which takes no
     * share argument at all. Offering the button regardless is what turns a
     * clear rule into a mysterious failure, so this hides or disables rather
     * than letting somebody find out by clicking.
     *
     * Defaults to `true` so a caller that has not been updated keeps today's
     * behaviour rather than silently losing its own controls.
     */
    canManage?: boolean;
    // True while the node's data may be stale (e.g. rendered from a local cache before
    // the first live API response of this page load). Keeps the action buttons from
    // acting on possibly-outdated service state.
    actionsDisabled?: boolean;
    // True before this page load's first response has landed, so the cached
    // `is_online` is a guess from a previous visit rather than an observation.
    // Held separately from `node.status` because it is about our knowledge, not
    // the node's state — but both render as "still resolving".
    statusPending?: boolean;
}

export function NodeCard({
    node,
    onCreateTunnel,
    onOpenFiles,
    onOpenScreen,
    onReboot,
    onShutdown,
    onRefreshStats,
    onConfigure,
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
    canManage = true,
    actionsDisabled = false,
    statusPending = false,
}: NodeCardProps) {
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
    // Unresolved either because this page load has not heard back yet, or because
    // the server itself has not: an agent that has authenticated but not yet
    // heartbeated has no metrics to show and is not offline either.
    const isResolving = statusPending || node.status === 'connecting';
    // Only an answered "not online" dims the card. While resolving, the card stays
    // live so it does not flash a veil and then remove it a moment later.
    const isConfirmedOffline = !isResolving && !node.is_online;
    const showConnectedLoader = node.is_online && node.connected_for_secs < 60;
    const memoryPercent = node.stats.host_mem_total_bytes
        ? clampPercent((node.stats.host_mem_used_bytes / node.stats.host_mem_total_bytes) * 100)
        : 0;
    const cpuPercent = clampPercent(node.stats.host_cpu);
    const loadAverageLabel = node.stats.host_load_average.map((value) => value.toFixed(2)).join(' / ');
    const freeMemoryBytes = Math.max(0, node.stats.host_mem_total_bytes - node.stats.host_mem_used_bytes);
    // Absent for agents older than the field, and for any node restored from the
    // localStorage cache before the first poll lands — so every consumer below
    // has to tolerate an empty list rather than assume at least one mount.
    const disks = node.stats.host_disks ?? [];
    const diskTotalBytes = node.stats.host_disk_total_bytes ?? 0;
    const diskUsedBytes = node.stats.host_disk_used_bytes ?? 0;
    const hasDiskStats = disks.length > 0 && diskTotalBytes > 0;
    const diskPercent = hasDiskStats ? clampPercent((diskUsedBytes / diskTotalBytes) * 100) : 0;
    const freeDiskBytes = Math.max(0, diskTotalBytes - diskUsedBytes);
    // The bar shows the aggregate, but the aggregate is the reassuring number: a
    // host with a 4 TB array and a full 2 GB /boot reads as barely used. The
    // fullest single mount is what an operator actually needs, so it sets the
    // disk meter's colour — and it is the only mount the dashboard's disk alert is
    // allowed to fire on, which is why both read it from the same helper. Every
    // other mount stays behind the storage dialog, unalerted.
    const fullestDisk = displayedFilesystem(node.stats);
    const nodeVersion = node.stats.version?.trim();
    const isIncompatible = node.is_online
        && !!nodeVersion
        && compareVersions(nodeVersion, MIN_COMPATIBLE_AGENT_VERSION) < 0;
    const displayIp = (node.ip || node.stats.ip || node.stats.host_ip || '').trim();
    const displayLocalIp = (node.stats.host_local_ip || '').trim();
    // Resolved by the agent itself at login, so it is the address the node sees
    // itself as having — which can differ from `node.ip`, the address the server
    // observed the connection arriving from (a relay or proxy hop in between).
    const publicIpInfo = node.info?.public ?? null;
    // The LAN segment the node sits on, read from its own routing table at login.
    // Unlike the public lookup this costs no round trip, so it is present for any
    // host with a default route — but absent entirely for agents older than the
    // field, hence every consumer below tolerates `null`.
    const lan = node.info?.lan ?? null;
    const gatewayIp = (lan?.gateway_ip ?? '').trim();
    const gatewayMac = (lan?.gateway_mac ?? '').trim();
    const lanCidr = (lan?.cidr ?? '').trim();
    const lanIface = (lan?.iface ?? '').trim();
    // Tri-state on purpose: `null` means the agent never reported the field, and
    // that is not the same claim as `false`. Only a real boolean earns the row
    // and the header badge — an older agent shows neither rather than being
    // labelled bare-metal on no evidence.
    const isContainer = typeof lan?.container === 'boolean' ? lan.container : null;
    // Whether the location dialog has a second half to show. `displayLocalIp` is
    // deliberately not counted: it predates the fingerprint and is present for
    // practically every node, so counting it would title a section "Local
    // network" over a single row the dialog never used to bother with.
    const hasLanDetails = !!(gatewayIp || gatewayMac || lanCidr || lanIface) || isContainer !== null;
    const plottable = hasCoordinates(publicIpInfo);
    const nodeLocationLabel = locationLabel(publicIpInfo);
    const countryFlag = flagFromCountryCode(publicIpInfo?.country_code);
    const normalizeServiceName = (service: string) => service.trim().toUpperCase().replace(/[\s_-]+/g, '');
    const monitorCount = node.monitor_count;

    const serviceCount = (kind: string) => Object.entries(node.services ?? {})
        .filter(([service]) => normalizeServiceName(service) === kind)
        .reduce((sum, [, count]) => sum + count, 0);
    // Every proxied HTTP request is authenticated, so there is no public state
    // left to signal — the padlock is now simply what an HTTP service is.
    const HttpProxyIcon = Lock;
    const totalServiceCount = (['SSH', 'SFTP', 'RDP', 'HTTP'] as const)
        .reduce((sum, kind) => sum + serviceCount(kind), 0);

    const [ipBlurred, setIpBlurred] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);

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
        /**
         * Why the list is empty, when it is empty for a reason.
         *
         * "Nothing configured" and "the server would not tell you" are different
         * answers and the dialog used to give the first for both — a node whose
         * share had been revoked, or one left over from another workspace,
         * opened a dialog that simply read as blank. The lookup throws now, and
         * this is what it throws into.
         */
        error: string | null;
    } | null>(null);

    const runOrPickInstance = async (kind: 'SSH' | 'SFTP' | 'HTTP' | 'RDP') => {
        setServiceInstancePicker({ kind, loading: true, instances: [], error: null });

        try {
            const instances = (await onListServices?.(kind.toLowerCase() as 'ssh' | 'sftp' | 'http' | 'rdp')) ?? [];
            setServiceInstancePicker({ kind, loading: false, instances, error: null });
        } catch (e) {
            setServiceInstancePicker({
                kind,
                loading: false,
                instances: [],
                error: e instanceof Error ? e.message : 'Could not load this node\u2019s services.',
            });
        }
    };

    const selectServiceInstance = (action: () => void) => {
        setServiceInstancePicker(null);
        action();
    };

    // Only one HTTP proxy is allowed per node; SSH/SFTP have no such limit.
    const httpLimitReached = serviceInstancePicker?.kind === 'HTTP'
        && !serviceInstancePicker.loading
        && (serviceInstancePicker.instances.length >= 1 || serviceInstancePicker.error !== null);

    const serviceInstanceLabel = (kind: 'SSH' | 'SFTP' | 'HTTP' | 'RDP') => (
        kind === 'SSH' ? 'SSH session' : kind === 'SFTP' ? 'SFTP session' : kind === 'RDP' ? 'RDP screen' : 'HTTP service'
    );

    // Same icon as the SSH/Files/Screen/HTTP action buttons.
    const serviceInstanceIcon = (kind: 'SSH' | 'SFTP' | 'HTTP' | 'RDP') => (
        kind === 'SSH' ? Terminal : kind === 'SFTP' ? FolderOpen : kind === 'RDP' ? MonitorPlay : Lock
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

    const isLive = !isConfirmedOffline && !isResolving && !isIncompatible && !showConnectedLoader;
    const statusLabel = isIncompatible
        ? 'Incompatible'
        : statusPending
            ? 'Checking'
            : isResolving || showConnectedLoader
                ? 'Connecting'
                : node.is_online ? 'Online' : 'Offline';
    const statusTone = isIncompatible
        ? 'text-warning'
        : isResolving || showConnectedLoader
            ? 'text-warning'
            : node.is_online ? 'text-success' : 'text-muted-foreground';
    const osLabel = node.stats.host_os_info?.trim() || 'Unknown OS';

    const services = [
        { kind: 'SSH' as const, label: 'SSH', Icon: Terminal },
        { kind: 'SFTP' as const, label: 'SFTP', Icon: FolderOpen },
        { kind: 'RDP' as const, label: 'RDP', Icon: MonitorPlay },
        { kind: 'HTTP' as const, label: 'HTTP', Icon: HttpProxyIcon },
    ];

    const blur = (value: string) => (ipBlurred ? '••••••••' : value);

    return (
        <div className="relative h-full">
            {/*
             * The card answers three questions and nothing else: is it up, is it
             * healthy, how do I get in. Everything an operator reads less often —
             * addresses, mounts, the map, process counts — lives behind Details,
             * so a fleet of twenty reads as twenty rows of the same shape.
             */}
            <div
                className={cn(
                    'group flex h-full flex-col rounded-lg border border-hairline bg-card transition-colors duration-100',
                    'hover:border-hairline-strong',
                )}
            >
                {/* Header */}
                <div className="flex items-start gap-2.5 px-3.5 pt-3">
                    <span className="mt-[6px] shrink-0">
                        <StatusIndicator isOnline={node.is_online} pending={isResolving || showConnectedLoader} size="sm" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                            <h3 className="truncate text-[14px] font-semibold leading-5 text-foreground">
                                {node.name}
                            </h3>
                            {isShared ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="shrink-0 rounded-sm border border-hairline px-1 text-[10px] leading-4 text-muted-foreground">
                                            Shared
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>{sharedBy ? `Shared with you by ${sharedBy}` : 'Shared with you'}</TooltipContent>
                                </Tooltip>
                            ) : null}
                        </div>
                        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-muted-foreground">
                            {countryFlag ? (
                                <span aria-hidden="true" className="shrink-0" title={nodeLocationLabel || undefined}>{countryFlag}</span>
                            ) : null}
                            <span className="truncate">{osLabel}</span>
                            {isContainer ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <ContainerIcon className="h-3.5 w-3.5 shrink-0 text-lime" aria-label="Runs in a container" />
                                    </TooltipTrigger>
                                    <TooltipContent>Agent runs inside a container</TooltipContent>
                                </Tooltip>
                            ) : null}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {isLive ? (
                            <span className="pt-[3px] text-[12px] tabular-nums text-muted-foreground" title="Host uptime">
                                {formatDuration(node.stats.host_uptime_secs)}
                            </span>
                        ) : (
                            <span className={cn('flex items-center gap-1 pt-[3px] text-[12px] font-medium', statusTone)}>
                                {(isResolving || showConnectedLoader) && !isIncompatible ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : null}
                                {statusLabel}
                            </span>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="-mr-1.5 h-7 w-7 text-muted-foreground hover:text-foreground md:h-7 md:w-7"
                                    aria-label={`Open actions for ${node.name}`}
                                >
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem onClick={() => setDetailsOpen(true)}>
                                    <Info className="mr-2 h-4 w-4" />
                                    View details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onViewNodeId?.(node)}>
                                    <Globe className="mr-2 h-4 w-4" />
                                    View node ID
                                </DropdownMenuItem>
                                {/* Renaming and deleting are the node's
                                    configuration, so they are the owner's — and an
                                    administrator's. Omitted rather than shown disabled. */}
                                {canManage ? (
                                    <>
                                        <DropdownMenuItem onClick={() => onRename?.(node)}>
                                            <Pencil className="mr-2 h-4 w-4" />
                                            Rename node
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            onClick={() => onDelete?.(node)}
                                            className="text-destructive focus:text-destructive"
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Delete node
                                        </DropdownMenuItem>
                                    </>
                                ) : null}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Resources. One row, three readings. When the node is not live
                    the numbers are from its last report, so they are withheld
                    rather than shown as if current. */}
                <div className="grid grid-cols-3 gap-3 px-3.5 pb-3 pt-2.5">
                    <Meter
                        label="CPU"
                        value={cpuPercent}
                        live={isLive}
                        hint={`Load ${loadAverageLabel}`}
                    />
                    <Meter
                        label="Memory"
                        value={memoryPercent}
                        live={isLive}
                        hint={`${formatBytes(node.stats.host_mem_used_bytes)} of ${formatBytes(node.stats.host_mem_total_bytes)}`}
                    />
                    <Meter
                        label="Disk"
                        value={hasDiskStats ? diskPercent : null}
                        live={isLive}
                        // The aggregate is the reassuring number; the fullest mount
                        // is the one that pages someone, so it gets the warning tone.
                        tone={fullestDisk ? percentUsed(fullestDisk) : undefined}
                        hint={hasDiskStats
                            ? `${formatBytes(diskUsedBytes)} of ${formatBytes(diskTotalBytes)}${fullestDisk ? ` · fullest ${fullestDisk.mount} ${percentUsed(fullestDisk).toFixed(0)}%` : ''}`
                            : 'No storage reported'}
                    />
                </div>

                {/* Services + details */}
                <div className="mt-auto flex items-center gap-0.5 border-t border-hairline px-2 py-1.5">
                    {services.map(({ kind, label, Icon }) => {
                        const count = serviceCount(kind);
                        const configured = count > 0;
                        const tint = SERVICE_TINTS[kind];

                        return (
                            <Tooltip key={kind}>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        onClick={() => void runOrPickInstance(kind)}
                                        // An empty slot is an add button, which is
                                        // configuration — a grantee cannot use it.
                                        disabled={!isLive || actionsDisabled || (!configured && !canManage)}
                                        aria-label={configured
                                            ? `Open ${label} on ${node.name}`
                                            : canManage
                                                ? `Add a ${label} service to ${node.name}`
                                                : `No ${label} service on ${node.name}`}
                                        className={cn(
                                            'flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors',
                                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                                            'disabled:cursor-not-allowed disabled:opacity-40',
                                            configured
                                                ? 'text-foreground hover:bg-secondary'
                                                : 'text-muted-foreground/60 hover:bg-secondary hover:text-muted-foreground',
                                        )}
                                    >
                                        <Icon className={cn('h-3.5 w-3.5 shrink-0', configured ? tint.icon : '')} />
                                        <span>{label}</span>
                                        {configured && count > 1 ? (
                                            <span className="tabular-nums text-muted-foreground">{count}</span>
                                        ) : null}
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {!isLive
                                        ? `${node.name} is ${statusLabel.toLowerCase()}`
                                        : configured
                                            ? `Open ${label}${count > 1 ? ` (${count} services)` : ''}`
                                            : canManage
                                                ? `No ${label} service yet — click to add one`
                                                : `No ${label} service. Only this node's owner can add one.`}
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7 gap-0.5 px-2 text-[12px] text-muted-foreground hover:text-foreground md:h-7 md:px-2 md:text-[12px]"
                        onClick={() => setDetailsOpen(true)}
                        aria-label={`View details for ${node.name}`}
                    >
                        Details
                        <ChevronRight className="h-3.5 w-3.5" />
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
                        {serviceInstancePicker && !serviceInstancePicker.loading && serviceInstancePicker.error ? (
                            <p className="text-sm text-destructive">{serviceInstancePicker.error}</p>
                        ) : null}
                        {serviceInstancePicker && !serviceInstancePicker.loading && !serviceInstancePicker.error && serviceInstancePicker.instances.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                {canManage
                                    ? `No ${serviceInstanceLabel(serviceInstancePicker.kind)} configured yet.`
                                    // A grantee is not being shown an empty list
                                    // of their own services — they are being shown
                                    // that this one was not lent to them.
                                    : `This node was not shared with you for ${serviceInstanceLabel(serviceInstancePicker.kind)}.`}
                            </p>
                        ) : null}
                        {!serviceInstancePicker?.loading && serviceInstancePicker?.instances.map((instance) => {
                            const InstanceIcon = serviceInstanceIcon(serviceInstancePicker.kind);
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
                                </Button>
                                {/* Editing a service reads its credentials back, which is
                                    exactly what the settings path stays owner-gated for while
                                    they are stored in the clear. Deleting it is configuration
                                    by any reading. Both are dropped rather than disabled: the
                                    row then reads as one wide "open this" button, which is all
                                    a grantee can do with it. */}
                                {canManage ? (
                                    <>
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
                                    </>
                                ) : null}
                            </div>
                            );
                        })}
                    </div>
                    <DialogFooter className="flex-col items-stretch gap-1.5 sm:flex-col">
                        {canManage ? (
                            <>
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
                            </>
                        ) : (
                            // Said once, plainly, rather than left for somebody to infer from
                            // three missing buttons.
                            <p className="text-xs text-muted-foreground text-center">
                                Shared with you — only this node&apos;s owner can change its services.
                            </p>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Node details: everything the card leaves out. */}
            <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DialogContent className="flex h-[min(85vh,620px)] flex-col gap-0 p-0 sm:max-w-2xl">
                    <DialogHeader className="space-y-1 border-b border-hairline px-5 pb-3 pt-4 text-left">
                        <DialogTitle className="flex items-center gap-2 pr-8 text-[16px]">
                            <StatusIndicator isOnline={node.is_online} pending={isResolving || showConnectedLoader} size="sm" />
                            <span className="truncate">{node.name}</span>
                            <span className={cn('text-[12px] font-medium', statusTone)}>{statusLabel}</span>
                        </DialogTitle>
                        <DialogDescription className="truncate font-mono text-[12px]">
                            {node.stats.host_name?.trim() || 'Hostname unavailable'} · {osLabel}
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
                        <div className="flex items-center justify-between gap-3 px-5 pt-3">
                            <TabsList>
                                <TabsTrigger value="overview">Overview</TabsTrigger>
                                <TabsTrigger value="storage">Storage</TabsTrigger>
                                <TabsTrigger value="network">Network</TabsTrigger>
                            </TabsList>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 px-2 text-[12px] text-muted-foreground md:h-8"
                                onClick={() => setIpBlurred((blurred) => !blurred)}
                                aria-pressed={ipBlurred}
                            >
                                {ipBlurred ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                {ipBlurred ? 'Show addresses' : 'Hide addresses'}
                            </Button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
                            <TabsContent value="overview" className="mt-0 space-y-5">
                                {!isLive ? (
                                    <p className="rounded-md border border-hairline bg-secondary/50 px-3 py-2 text-[12px] text-muted-foreground">
                                        {statusLabel}. Figures below are from the node&apos;s last report.
                                    </p>
                                ) : null}
                                <section className="space-y-3">
                                    <h4 className="text-[13px] font-semibold text-foreground">Resources</h4>
                                    <DetailMeter
                                        label="CPU"
                                        value={cpuPercent}
                                        detail={`${node.stats.host_cpu.toFixed(1)}% · load ${loadAverageLabel}`}
                                    />
                                    <DetailMeter
                                        label="Memory"
                                        value={memoryPercent}
                                        detail={`${formatBytes(node.stats.host_mem_used_bytes)} of ${formatBytes(node.stats.host_mem_total_bytes)} · ${formatBytes(freeMemoryBytes)} free`}
                                    />
                                    {hasDiskStats ? (
                                        <DetailMeter
                                            label="Storage"
                                            value={diskPercent}
                                            tone={fullestDisk ? percentUsed(fullestDisk) : undefined}
                                            detail={`${formatBytes(diskUsedBytes)} of ${formatBytes(diskTotalBytes)} · ${formatBytes(freeDiskBytes)} free${fullestDisk ? ` · fullest ${fullestDisk.mount} ${percentUsed(fullestDisk).toFixed(0)}%` : ''}`}
                                        />
                                    ) : null}
                                </section>
                                <section>
                                    <h4 className="mb-2 text-[13px] font-semibold text-foreground">System</h4>
                                    <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                                        <DetailRow label="Uptime" value={formatDuration(node.stats.host_uptime_secs)} />
                                        <DetailRow label="Connected for" value={formatDuration(node.connected_for_secs)} />
                                        <DetailRow label="Agent version" value={nodeVersion || 'Unknown'} mono />
                                        <DetailRow label="Processes" value={String(node.stats.host_processes)} mono />
                                        <DetailRow label="Open connections" value={String(node.stats.host_connections)} mono />
                                        {monitorCount !== undefined ? (
                                            <DetailRow label="Monitors on this node" value={String(monitorCount)} mono />
                                        ) : null}
                                        {isContainer !== null ? (
                                            <DetailRow label="Runs in a container" value={isContainer ? 'Yes' : 'No'} />
                                        ) : null}
                                        <DetailRow label="MAC address" value={blur(node.stats.host_mac || 'Unknown')} mono />
                                        <DetailRow label="Services" value={totalServiceCount === 0 ? 'None' : String(totalServiceCount)} mono />
                                    </dl>
                                </section>
                            </TabsContent>

                            <TabsContent value="storage" className="mt-0">
                                {hasDiskStats ? (
                                    <>
                                        <p className="mb-3 text-[12px] text-muted-foreground">
                                            Every filesystem this node reported, largest first. Bind mounts and
                                            subvolumes of one device are counted once.
                                        </p>
                                        <DiskDetails disks={disks} formatBytes={formatBytes} />
                                    </>
                                ) : (
                                    <p className="text-[13px] text-muted-foreground">
                                        This node has not reported any storage. Agents older than the disk
                                        report show nothing here.
                                    </p>
                                )}
                            </TabsContent>

                            <TabsContent value="network" className="mt-0 space-y-5">
                                <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                                    <DetailRow label="Address seen by server" value={blur(displayIp || 'Unknown')} mono />
                                    <DetailRow label="Local address" value={blur(displayLocalIp || 'Unknown')} mono />
                                </dl>
                                {plottable ? (
                                    <div className="h-56 w-full overflow-hidden rounded-md border border-hairline">
                                        {/* Mounted only while this tab is open, which keeps
                                            MapLibre to a single WebGL context. */}
                                        <NodeLocationDetailMap
                                            latitude={publicIpInfo.latitude}
                                            longitude={publicIpInfo.longitude}
                                            label={nodeLocationLabel || node.name}
                                            className="h-full w-full"
                                        />
                                    </div>
                                ) : null}
                                {publicIpInfo ? (
                                    <section>
                                        <h4 className="mb-2 text-[13px] font-semibold text-foreground">
                                            Public address{nodeLocationLabel ? ` · ${nodeLocationLabel}` : ''}
                                        </h4>
                                        <LocationDetails location={publicIpInfo} blurred={ipBlurred} />
                                    </section>
                                ) : null}
                                {hasLanDetails ? (
                                    <section>
                                        <h4 className="mb-2 text-[13px] font-semibold text-foreground">Local network</h4>
                                        <LanFingerprintDetails lan={lan} localIp={displayLocalIp} blurred={ipBlurred} />
                                    </section>
                                ) : null}
                            </TabsContent>
                        </div>
                    </Tabs>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** Percent → status colour. Shared by the card meters and the details dialog. */
function meterTone(percent: number) {
    if (percent >= DISK_DANGER_PERCENT) return { bar: 'bg-destructive', text: 'text-destructive' };
    if (percent >= DISK_WARN_PERCENT) return { bar: 'bg-warning', text: 'text-warning' };
    return { bar: 'bg-accent', text: 'text-foreground' };
}

/**
 * A card reading: label and number on one line, a 3px bar under it. `tone`
 * overrides the value used for colour, so the disk meter can show the aggregate
 * while warning on the fullest mount.
 */
function Meter({ label, value, live, hint, tone }: {
    label: string;
    value: number | null;
    live: boolean;
    hint?: string;
    tone?: number;
}) {
    const shown = live && value !== null;
    const colour = meterTone(tone ?? value ?? 0);

    const body = (
        <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-1 text-[11px] leading-4">
                <span className="text-muted-foreground">{label}</span>
                <span className={cn('font-mono tabular-nums', shown ? colour.text : 'text-muted-foreground/60')}>
                    {shown ? `${Math.round(value)}%` : '—'}
                </span>
            </div>
            <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-muted">
                {shown ? (
                    <div
                        className={cn('h-full rounded-full transition-[width] duration-500', colour.bar)}
                        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
                    />
                ) : null}
            </div>
        </div>
    );

    if (!hint || !shown) return body;

    return (
        <Tooltip>
            <TooltipTrigger asChild>{body}</TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
        </Tooltip>
    );
}

function DetailMeter({ label, value, detail, tone }: { label: string; value: number; detail: string; tone?: number }) {
    const colour = meterTone(tone ?? value);

    return (
        <div>
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="font-medium text-foreground">{label}</span>
                <span className="truncate text-muted-foreground">{detail}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                    className={cn('h-full rounded-full', colour.bar)}
                    style={{ width: `${Math.max(1, Math.min(100, value))}%` }}
                />
            </div>
        </div>
    );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-1.5 text-[12px]">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className={cn('min-w-0 truncate text-right text-foreground', mono && 'font-mono')}>{value}</dd>
        </div>
    );
}
