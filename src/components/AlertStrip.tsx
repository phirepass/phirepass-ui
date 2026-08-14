import { AlertTriangle, Info, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

export type AlertLevel = 'error' | 'warning' | 'info';

export interface AlertEntry {
    id: string;
    level: AlertLevel;
    title: string;
    message: string;
    /** Short mono tag shown beside the title, e.g. the resource the alert is about. */
    tag?: string;
}

const LEVEL_STYLES: Record<AlertLevel, { panel: string; well: string; icon: string }> = {
    error: {
        panel: 'bg-destructive/10 border-destructive/30',
        well: 'bg-destructive/20',
        icon: 'text-destructive',
    },
    warning: {
        panel: 'bg-warning/10 border-warning/30',
        well: 'bg-warning/20',
        icon: 'text-warning',
    },
    info: {
        panel: 'bg-primary/10 border-primary/30',
        well: 'bg-primary/20',
        icon: 'text-primary',
    },
};

const LEVEL_ICONS: Record<AlertLevel, typeof XCircle> = {
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
};

interface AlertStripProps {
    alerts: AlertEntry[];
    className?: string;
}

/**
 * The band of actionable warnings that sits above a page's content. Renders
 * nothing when there is nothing wrong — a permanent "all clear" panel trains
 * people to stop reading the row entirely.
 */
export function AlertStrip({ alerts, className }: AlertStripProps) {
    if (alerts.length === 0) {
        return null;
    }

    return (
        <div className={cn('space-y-2 max-h-[300px] overflow-y-auto', className)}>
            {alerts.map((alert) => {
                const styles = LEVEL_STYLES[alert.level];
                const Icon = LEVEL_ICONS[alert.level];

                return (
                    <div
                        key={alert.id}
                        className={cn('flex items-start gap-3 p-3 rounded-lg border transition-all', styles.panel)}
                    >
                        <div
                            className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                                styles.well
                            )}
                        >
                            <Icon className={cn('w-4 h-4', styles.icon)} />
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-medium text-sm">{alert.title}</h4>
                                {alert.tag ? (
                                    <span className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                                        {alert.tag}
                                    </span>
                                ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 first-letter:uppercase">{alert.message}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
