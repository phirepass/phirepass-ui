import { LucideIcon } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type StatTone =
    | 'neutral'
    | 'primary'
    | 'accent'
    | 'success'
    | 'danger'
    | 'warning'
    | 'info'
    | 'violet';

/**
 * Per-tone icon colour plus the wash behind it. Written out in full because
 * Tailwind cannot resolve class names assembled at runtime.
 */
const TONE_STYLES: Record<StatTone, { icon: string }> = {
    neutral: { icon: 'text-muted-foreground' },
    primary: { icon: 'text-foreground' },
    accent: { icon: 'text-accent' },
    success: { icon: 'text-success' },
    danger: { icon: 'text-destructive' },
    warning: { icon: 'text-warning' },
    info: { icon: 'text-info' },
    violet: { icon: 'text-violet' },
};

export interface StatTile {
    label: string;
    value: number | string;
    icon: LucideIcon;
    tone?: StatTone;
    /**
    * Extra context. Surfaced on hover rather than as a second line, so every
    * tile on every page keeps exactly the same height.
    */
    hint?: string;
}

interface StatTilesProps {
    tiles: StatTile[];
    className?: string;
    /** Column count at the `md` breakpoint. Two columns on mobile either way. */
    columns?: 3 | 4 | 5;
}

const COLUMN_CLASSES: Record<NonNullable<StatTilesProps['columns']>, string> = {
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
    5: 'md:grid-cols-5',
};

/**
 * The summary strip that sits under a page header: one bordered panel divided
 * into single-line cells, rather than a card per number. The cells read as one
 * row of readings about the same thing, and the one-line body keeps the strip
 * the same height on every page. Anything more belongs in the tooltip.
 */
export function StatTiles({ tiles, className, columns = 4 }: StatTilesProps) {
    return (
        <div className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline [&>*:last-child:nth-child(odd)]:col-span-2 md:[&>*:last-child:nth-child(odd)]:col-span-1', COLUMN_CLASSES[columns], className)}>
            {tiles.map((tile) => {
                const tone = TONE_STYLES[tile.tone ?? 'neutral'];

                // One line per reading: icon, label, then the number pushed to
                // the right edge, so the whole strip is a single 40px band.
                const body = (
                    <div className="flex h-full min-w-0 items-center gap-2.5 bg-card px-4 py-3">
                        <tile.icon className={cn('h-4 w-4 shrink-0', tone.icon)} />
                        <span className="min-w-0 truncate text-[14px] text-muted-foreground">{tile.label}</span>
                        <span className="ml-auto shrink-0 text-[18px] font-semibold leading-6 tabular-nums text-foreground">{tile.value}</span>
                    </div>
                );

                if (!tile.hint) {
                    return <div key={tile.label}>{body}</div>;
                }

                return (
                    <Tooltip key={tile.label}>
                        <TooltipTrigger asChild>{body}</TooltipTrigger>
                        <TooltipContent>{tile.hint}</TooltipContent>
                    </Tooltip>
                );
            })}
        </div>
    );
}
