'use client';

import { useState } from 'react';
import { AlertTriangle, Info, X, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
 *
 * Every line closes. The pages using this poll every fifteen seconds and rebuild
 * their alerts from scratch each time, so a dismissal has to be remembered here,
 * by id, or a closed line would be back on the next tick.
 *
 * Two things follow from that, both deliberate:
 *
 * - **A dismissal is forgotten once its alert clears.** If a monitor recovers
 *   and later fails again, it is announced again rather than staying hidden
 *   because somebody closed it an hour ago. Closing a line says "I have seen
 *   this", not "never tell me about this".
 * - **It lasts as long as the page is open.** Nothing is persisted, so leaving
 *   and coming back brings the row back. An alert is a statement about the fleet
 *   right now, and a dismissal that outlived the session would be a setting with
 *   no screen to undo it from.
 */
export function AlertStrip({ alerts, className }: AlertStripProps) {
    const [dismissed, setDismissed] = useState<string[]>([]);

    // Compared as a string, not as the array, which is rebuilt on every poll and
    // is a different object each time even when nothing has changed.
    const ids = alerts.map((alert) => alert.id).join(' ');
    const [seenIds, setSeenIds] = useState(ids);

    // Adjusted during render rather than in an effect: this is derived state,
    // and doing it here means the strip never commits a frame showing a line it
    // is about to drop — where an effect would paint once, then correct itself.
    if (ids !== seenIds) {
        const present = new Set(ids ? ids.split(' ') : []);

        setSeenIds(ids);
        setDismissed((previous) => {
            const next = previous.filter((id) => present.has(id));
            // Same contents, same reference: a fresh array would re-render the
            // strip on every poll for nothing.
            return next.length === previous.length ? previous : next;
        });
    }

    const visible = alerts.filter((alert) => !dismissed.includes(alert.id));

    if (visible.length === 0) {
        return null;
    }

    return (
        <div className={cn('space-y-2 max-h-[300px] overflow-y-auto', className)}>
            {visible.map((alert) => {
                const styles = LEVEL_STYLES[alert.level];
                const Icon = LEVEL_ICONS[alert.level];

                return (
                    <div
                        key={alert.id}
                        className={cn('mac-squircle flex items-start gap-3 rounded-xl border p-3 shadow-[inset_0_1px_0_0_var(--specular)] transition-all', styles.panel)}
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
                                    <span className="rounded-[5px] border border-hairline bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                                        {alert.tag}
                                    </span>
                                ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 first-letter:uppercase">{alert.message}</p>
                        </div>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-foreground"
                            // Named rather than a bare "Dismiss", so a screen
                            // reader three alerts down says which one it closes.
                            aria-label={`Dismiss alert: ${alert.title}`}
                            onClick={() => setDismissed((previous) => [...previous, alert.id])}
                        >
                            <X className="w-3 h-3" />
                        </Button>
                    </div>
                );
            })}
        </div>
    );
}
