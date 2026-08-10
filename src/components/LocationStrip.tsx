import { cn } from '@/lib/utils';
import { coordinateLabel, flagFromCountryCode, hasCoordinates, locationLabel } from '@/lib/geo';
import type { PublicIpLocation } from '@/types/geo';

import { NodeLocationMap } from './NodeLocationMap';

export interface LocationStripProps {
    location: PublicIpLocation | null | undefined;
    /** Tints the marker as live rather than muted. */
    active?: boolean;
    /** Hides the coordinates behind a blur, matching how IPs are masked. */
    blurred?: boolean;
    /** Renders as a button when given; a plain panel otherwise. */
    onClick?: () => void;
    /** Completes "Show … on a map" for the accessible name. */
    subject?: string;
    className?: string;
}

/**
 * The compact locator that sits on a card: a zoomed world map with a marker,
 * captioned with flag, place and coordinates.
 *
 * Shared by node cards and uptime monitor cards, which display the same thing
 * about different subjects — where the public address at the far end sits.
 * Returns `null` when there is nothing to plot: an empty map frame says less
 * than no map at all, and private targets legitimately have no location.
 */
export function LocationStrip({
    location,
    active = false,
    blurred = false,
    onClick,
    subject,
    className,
}: LocationStripProps) {
    if (!hasCoordinates(location)) {
        return null;
    }

    const label = locationLabel(location);
    const coordinates = coordinateLabel(location);
    const flag = flagFromCountryCode(location.country_code);

    const body = (
        <>
            <NodeLocationMap
                latitude={location.latitude}
                longitude={location.longitude}
                label={label}
                isOnline={active}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-card via-card/80 to-transparent px-2 pb-1.5 pt-5">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
                    {flag ? <span aria-hidden="true">{flag}</span> : null}
                    <span className="truncate">{label || 'Unknown location'}</span>
                </span>
                <span
                    className={cn(
                        'shrink-0 font-mono text-[10px] text-muted-foreground',
                        blurred && 'blur-sm select-none'
                    )}
                >
                    {coordinates}
                </span>
            </div>
        </>
    );

    const shared = cn(
        'relative block h-20 w-full overflow-hidden rounded-lg border border-border/60',
        className
    );

    if (!onClick) {
        return <div className={shared}>{body}</div>;
    }

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`Show ${label || subject || 'location'} on a map`}
            className={cn(
                shared,
                'group/map transition-colors hover:border-accent/60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
            )}
        >
            {body}
        </button>
    );
}
