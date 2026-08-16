import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { NodeFilesystem } from '@/types/node';

import { DISK_DANGER_PERCENT, DISK_WARN_PERCENT, percentUsed } from './disk-display';

export interface DiskDetailsProps {
    disks: NodeFilesystem[] | undefined;
    /** Shared with the card so both render bytes identically. */
    formatBytes: (bytes: number) => string;
    className?: string;
}

/**
 * Every filesystem the node reported, one row each.
 *
 * The card shows an aggregate, which is the reassuring number — a host with a
 * 4 TB array and a full 2 GB `/boot` reads as barely used. This is where that
 * hides nothing: mounts arrive largest-first from the agent and stay in that
 * order, since a list that reshuffles between 15-second polls reads as data
 * changing when it has not.
 *
 * Renders nothing at all for an agent that reported no disks. Absent is not the
 * same claim as "this machine has no storage", so it makes no claim.
 */
export function DiskDetails({ disks, formatBytes, className }: DiskDetailsProps) {
    const rows = (disks ?? []).filter((fs) => fs.total_bytes > 0);

    if (rows.length === 0) {
        return null;
    }

    const critical = rows.filter((fs) => percentUsed(fs) >= DISK_DANGER_PERCENT);

    return (
        <div className={className}>
            <div className="space-y-2.5">
                {rows.map((fs) => {
                    const used = percentUsed(fs);
                    const tone =
                        used >= DISK_DANGER_PERCENT
                            ? 'bg-destructive'
                            : used >= DISK_WARN_PERCENT
                                ? 'bg-warning'
                                : 'bg-accent';

                    return (
                        <div key={fs.mount} className="min-w-0">
                            <div className="flex items-baseline justify-between gap-3 text-xs">
                                <span className="truncate font-mono text-foreground" title={fs.mount}>
                                    {fs.mount}
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                    {formatBytes(fs.total_bytes - fs.available_bytes)} / {formatBytes(fs.total_bytes)}
                                    <span className="ml-2 text-foreground">{used.toFixed(1)}%</span>
                                </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                                <div
                                    className={cn('h-full rounded-full transition-all', tone)}
                                    style={{ width: `${used}%` }}
                                />
                            </div>
                            <div className="mt-1 flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
                                <span className="truncate">{fs.fs_type || 'unknown'}</span>
                                <span className="shrink-0 tabular-nums">
                                    {formatBytes(fs.available_bytes)} free
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {critical.length > 0 ? (
                <p className="mt-3 flex items-center gap-2 rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {critical.length === 1
                        ? `${critical[0].mount} is over ${DISK_DANGER_PERCENT}% full.`
                        : `${critical.length} filesystems are over ${DISK_DANGER_PERCENT}% full.`}
                </p>
            ) : null}
        </div>
    );
}
