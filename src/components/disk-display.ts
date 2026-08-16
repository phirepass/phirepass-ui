import type { NodeFilesystem } from '@/types/node';

/** Above this a mount is called out; matches the warning tier in `StatBar`. */
export const DISK_WARN_PERCENT = 70;
/** Above this it is the loud kind of full. Same tier as `StatBar`'s danger. */
export const DISK_DANGER_PERCENT = 90;

/**
 * How full one filesystem is, 0-100.
 *
 * Reads a few points higher than `df`'s `Use%` on unix, and deliberately so: the
 * agent reports total and available, and the gap between them includes the
 * root-reserved blocks. `df` excludes that reserve from both halves of its
 * fraction; we cannot, because the platform never told us how big it is. The
 * conservative direction is the right one for an alert — that space is not
 * available to the service about to run out of it.
 */
export function percentUsed(fs: NodeFilesystem): number {
    if (fs.total_bytes <= 0) {
        return 0;
    }
    const percent = ((fs.total_bytes - fs.available_bytes) / fs.total_bytes) * 100;
    return Math.max(0, Math.min(100, percent));
}

/**
 * The filesystem closest to full, which is the one worth alerting on.
 *
 * Not the aggregate: a host with a 4 TB array and a full 2 GB `/boot` totals
 * about 0% used and has an outage coming. `null` when the node reported no
 * disks — absent is not the same claim as healthy.
 */
export function fullestFilesystem(
    disks: NodeFilesystem[] | undefined,
): NodeFilesystem | null {
    return (disks ?? [])
        .filter((fs) => fs.total_bytes > 0)
        .reduce<NodeFilesystem | null>(
            (worst, fs) => (!worst || percentUsed(fs) > percentUsed(worst) ? fs : worst),
            null,
        );
}
