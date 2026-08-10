import { cn } from '@/lib/utils';
import { WORLD_LAND_PATH } from '@/lib/world-map-path';

/**
 * The land silhouette is drawn in a plate carrée projection over a `0 0 360 180`
 * viewBox, which is the whole reason this component needs no mapping library:
 * placing a point is just `x = lon + 180`, `y = 90 - lat`. Zooming is likewise
 * only a narrower viewBox — no tiles, no requests, no API key.
 */
const WORLD_WIDTH = 360;
const WORLD_HEIGHT = 180;

/**
 * Degrees of longitude shown by default. Wide enough that the surrounding
 * continent is recognisable — a node in Cyprus reads as "eastern Mediterranean",
 * not as an unplaceable dot — while still being a location rather than a world
 * map. The source geometry is 1:110m, so zooming much past this only magnifies
 * the simplification.
 */
const DEFAULT_SPAN_DEGREES = 120;
const MIN_SPAN_DEGREES = 20;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface NodeLocationMapProps {
    latitude: number;
    longitude: number;
    /** Rendered into the accessible name, e.g. `Athens, Greece`. */
    label?: string;
    /** Live nodes get the accent marker; everything else stays muted. */
    isOnline?: boolean;
    /** Degrees of longitude across the viewport. Smaller zooms in. */
    spanDegrees?: number;
    className?: string;
}

/**
 * A small locator map for the public address an agent reported at login.
 *
 * Deliberately not a slippy map: it is decoration for a coordinate we already
 * have, so it must not cost a tile request per card, leak node locations to a
 * tile host, or pull a mapping library into the bundle.
 */
export function NodeLocationMap({
    latitude,
    longitude,
    label,
    isOnline = false,
    spanDegrees = DEFAULT_SPAN_DEGREES,
    className,
}: NodeLocationMapProps) {
    const pointX = longitude + 180;
    const pointY = 90 - latitude;

    const span = clamp(spanDegrees, MIN_SPAN_DEGREES, WORLD_WIDTH);
    const spanY = span / 2;

    // Centre on the marker, then pull the window back inside the world so a node
    // near a pole or the antimeridian shows real geography instead of blank space.
    const viewX = clamp(pointX - span / 2, 0, WORLD_WIDTH - span);
    const viewY = clamp(pointY - spanY / 2, 0, WORLD_HEIGHT - spanY);

    // Marker and rings are sized off the span, so they stay visually constant at
    // any zoom; strokes use non-scaling-stroke for the same reason.
    const markerRadius = span / 48;

    return (
        <svg
            viewBox={`${viewX} ${viewY} ${span} ${spanY}`}
            preserveAspectRatio="xMidYMid slice"
            role="img"
            aria-label={label ? `Map showing ${label}` : 'Map showing node location'}
            className={cn('block h-full w-full', className)}
        >
            <rect x={viewX} y={viewY} width={span} height={spanY} className="fill-muted/30" />
            {/* Land is tinted off the foreground rather than filled with `muted`:
                against the card's own dark background the two were within a few
                points of lightness of each other, which read as a smudge instead
                of a coastline. */}
            <path
                d={WORLD_LAND_PATH}
                className="fill-muted-foreground/25 stroke-muted-foreground/30"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
            />

            <g className={isOnline ? 'text-accent' : 'text-muted-foreground'}>
                {/* Crosshair, so the position is readable even where the marker
                    sits against a busy coastline. */}
                <line
                    x1={viewX}
                    y1={pointY}
                    x2={viewX + span}
                    y2={pointY}
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                    opacity={0.35}
                />
                <line
                    x1={pointX}
                    y1={viewY}
                    x2={pointX}
                    y2={viewY + spanY}
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                    opacity={0.35}
                />
                <circle cx={pointX} cy={pointY} r={markerRadius * 2.5} fill="currentColor" opacity={0.18} />
                <circle
                    cx={pointX}
                    cy={pointY}
                    r={markerRadius}
                    fill="currentColor"
                    stroke="hsl(var(--card))"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                />
            </g>
        </svg>
    );
}
