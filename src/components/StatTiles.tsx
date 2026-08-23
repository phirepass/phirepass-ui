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
const TONE_STYLES: Record<StatTone, { icon: string; well: string }> = {
    neutral: { icon: 'text-muted-foreground', well: 'bg-white/[0.06]' },
    primary: { icon: 'text-primary', well: 'bg-white/[0.06]' },
    accent: { icon: 'text-accent', well: 'bg-accent/10' },
    success: { icon: 'text-success', well: 'bg-success/10' },
    danger: { icon: 'text-destructive', well: 'bg-destructive/10' },
    warning: { icon: 'text-warning', well: 'bg-warning/10' },
    info: { icon: 'text-info', well: 'bg-info/10' },
    violet: { icon: 'text-violet', well: 'bg-violet/10' },
};

export interface StatTile {
    label: string;
    value: number | string;
    icon: LucideIcon;
    tone?: StatTone;
    /**
    * Extra context. Surfaced on hover rather than as a third line, so every
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
 * The summary strip that sits under a page header. Every dashboard page renders
 * its stats through this one component, so the row is the same height on all of
 * them — which only holds because the tile body is fixed at two lines. Anything
 * that would add a third belongs in the tooltip.
 */
export function StatTiles({ tiles, className, columns = 4 }: StatTilesProps) {
    return (
        <div className={cn('grid grid-cols-2 gap-4', COLUMN_CLASSES[columns], className)}>
            {tiles.map((tile) => {
                const tone = TONE_STYLES[tile.tone ?? 'neutral'];

                const body = (
                    <div className="gradient-card mac-squircle flex items-center gap-3.5 rounded-xl border border-hairline p-4 transition-[box-shadow,border-color] duration-200 ease-mac hover:border-hairline-strong hover:shadow-window-raised">
                        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] mac-squircle', tone.well, tone.icon)}>
                            <tile.icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular-nums">{tile.value}</p>
                            <p className="truncate text-[12px] text-muted-foreground">
                                {tile.label}
                            </p>
                        </div>
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
