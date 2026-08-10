'use client';

import dynamic from 'next/dynamic';
import { Loader2, MapPin } from 'lucide-react';

import { LocationDetails } from '@/components/LocationDetails';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { flagFromCountryCode, hasCoordinates, locationLabel } from '@/lib/geo';
import { cn } from '@/lib/utils';
import type { ServerInstance } from '@/types/server';

import {
    SERVER_STATUS_STYLES,
    formatBytes,
    formatRelativeTime,
    formatUptime,
} from './server-display';

/** Loaded on demand: MapLibre is WebGL and ~250 KB gzipped, and only one map is
 *  ever mounted at a time — see NodeLocationDetailMap for why that matters. */
const ServerLocationMap = dynamic(
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

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-border/40 py-1.5 last:border-0">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
            <span className="min-w-0 truncate text-right font-mono text-sm text-foreground">{value}</span>
        </div>
    );
}

interface ServerDetailDialogProps {
    server: ServerInstance | null;
    onClose: () => void;
}

export function ServerDetailDialog({ server, onClose }: ServerDetailDialogProps) {
    if (!server) return null;

    const statusStyle = SERVER_STATUS_STYLES[server.status];
    const plottable = hasCoordinates(server.location);
    const place = locationLabel(server.location);

    return (
        <Dialog open={!!server} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', statusStyle.dot)} />
                        {server.fqdn}
                        <span className={cn('text-sm font-medium', statusStyle.text)}>
                            {statusStyle.label}
                        </span>
                    </DialogTitle>
                    <DialogDescription>
                        Instance {server.id}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                            Addressing
                        </p>
                        <div className="rounded-lg border border-border bg-card/60 px-3 py-1">
                            <Row label="FQDN" value={server.fqdn} />
                            <Row label="Public" value={`${server.public_ip}:${server.port}`} />
                            <Row label="Private" value={server.private_ip} />
                            <Row label="Version" value={server.version} />
                        </div>
                    </div>

                    <div>
                        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                            Host &amp; load
                        </p>
                        <div className="rounded-lg border border-border bg-card/60 px-3 py-1">
                            <Row label="Host" value={server.host_name} />
                            <Row label="OS" value={server.host_os_info} />
                            <Row
                                label="Memory"
                                value={`${formatBytes(server.mem_used_bytes)} / ${formatBytes(server.mem_total_bytes)}`}
                            />
                            <Row
                                label="Load"
                                value={server.load_average
                                    ? server.load_average.map((v) => v.toFixed(2)).join(' / ')
                                    : '—'}
                            />
                        </div>
                    </div>

                    <div>
                        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                            Carrying
                        </p>
                        <div className="rounded-lg border border-border bg-card/60 px-3 py-1">
                            <Row label="Nodes" value={String(server.nodes)} />
                            <Row label="Clients" value={String(server.connections)} />
                            <Row label="Sessions" value={String(server.sessions)} />
                        </div>
                    </div>

                    <div>
                        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                            Lifetime
                        </p>
                        <div className="rounded-lg border border-border bg-card/60 px-3 py-1">
                            <Row label="Uptime" value={formatUptime(server.uptime_secs)} />
                            <Row label="Last keepalive" value={formatRelativeTime(server.last_seen_at)} />
                            <Row
                                label="Started"
                                value={server.started_at ? new Date(server.started_at).toLocaleString() : '—'}
                            />
                        </div>
                    </div>
                </div>

                {plottable ? (
                    <div>
                        <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />
                            Location
                            <span className="ml-auto normal-case tracking-normal text-muted-foreground/80">
                                {flagFromCountryCode(server.location?.country_code)} {place}
                            </span>
                        </p>
                        <div className="h-64 w-full overflow-hidden rounded-lg border border-border">
                            <ServerLocationMap
                                latitude={server.location!.latitude!}
                                longitude={server.location!.longitude!}
                                label={place || server.fqdn}
                                className="h-full w-full"
                            />
                        </div>
                        <LocationDetails location={server.location} className="mt-3" />
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
