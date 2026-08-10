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
    neutral: { icon: 'text-muted-foreground', well: 'bg-secondary' },
    primary: { icon: 'text-primary', well: 'bg-secondary' },
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
                    <div className="gradient-card border border-border rounded-xl p-4 flex items-center gap-4 transition-colors hover:border-border/80">
                        <div className={cn('p-3 rounded-lg shrink-0', tone.well, tone.icon)}>
                            <tile.icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-2xl font-bold leading-tight tabular-nums">{tile.value}</p>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider truncate">
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
