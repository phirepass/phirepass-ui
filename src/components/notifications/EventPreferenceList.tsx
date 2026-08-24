'use client';

import { useMemo } from 'react';
import { Activity, Server, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
    NOTIFICATION_CATEGORY_DESCRIPTIONS,
    NOTIFICATION_CATEGORY_LABELS,
    NOTIFICATION_CATEGORY_ORDER,
    NOTIFICATION_EVENTS,
    type NotificationCategory,
    type NotificationEventDefinition,
    type NotificationEventId,
    type NotificationPreferences,
} from '@/types/notification';

import { CATEGORY_STYLES, EVENT_STYLES } from './notification-display';

const CATEGORY_ICONS: Record<NotificationCategory, LucideIcon> = {
    nodes: Server,
    monitors: Activity,
};



interface EventPreferenceListProps {
    preferences: NotificationPreferences;
    /** True while delivery is off account-wide: the switches keep their state
    *  but stop being actionable, because changing them would decide nothing. */
    disabled: boolean;
    onToggle: (event: NotificationEventDefinition, next: boolean) => void;
    onToggleCategory: (category: NotificationCategory, next: boolean) => void;
}

export function EventPreferenceList({
    preferences,
    disabled,
    onToggle,
    onToggleCategory,
}: EventPreferenceListProps) {
    const grouped = useMemo(() => {
        return NOTIFICATION_CATEGORY_ORDER
            .map((category) => ({
                category,
                events: NOTIFICATION_EVENTS.filter((event) => event.category === category),
            }))
            .filter((group) => group.events.length > 0);
    }, []);

    return (
        <div className="space-y-4">
            {grouped.map(({ category, events }) => {
                const enabledCount = events.filter((event) => preferences[event.id]).length;
                // Measured over what the bulk button can actually turn on: it
                // skips `noisy` events, so counting those would leave the button
                // stuck on "Turn all on" after it had already done everything it
                // is willing to do. The count beside it stays honest about all
                // of them.
                const bulkOn = events.every((event) => event.noisy || preferences[event.id]);
                const style = CATEGORY_STYLES[category];
                const Icon = CATEGORY_ICONS[category];

                return (
                    <section
                        key={category}
                        className={cn(
                            'gradient-card mac-squircle overflow-hidden rounded-xl border border-hairline',
                            'transition-opacity duration-200 ease-mac',
                            disabled && 'opacity-60'
                        )}
                        aria-label={NOTIFICATION_CATEGORY_LABELS[category]}
                    >
                        <header className="flex flex-col gap-3 border-b border-hairline p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                                <span
                                    aria-hidden
                                    className={cn(
                                        'mac-squircle flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px]',
                                        style.well,
                                        style.icon
                                    )}
                                >
                                    <Icon className="h-5 w-5" />
                                </span>
                                <div className="min-w-0">
                                    <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">
                                        {NOTIFICATION_CATEGORY_LABELS[category]}
                                    </h2>
                                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                                        {NOTIFICATION_CATEGORY_DESCRIPTIONS[category]}
                                    </p>
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-3 self-start sm:self-auto">
                                <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                                    {enabledCount} of {events.length} on
                                </span>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={disabled}
                                    onClick={() => onToggleCategory(category, !bulkOn)}
                                >
                                    {bulkOn ? 'Turn all off' : 'Turn all on'}
                                </Button>
                            </div>
                        </header>

                        <div className="divide-y divide-hairline">
                            {events.map((event) => (
                                <EventRow
                                    key={event.id}
                                    event={event}
                                    checked={preferences[event.id]}
                                    disabled={disabled}
                                    onToggle={onToggle}
                                />
                            ))}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

interface EventRowProps {
    event: NotificationEventDefinition;
    checked: boolean;
    disabled: boolean;
    onToggle: (event: NotificationEventDefinition, next: boolean) => void;
}

function EventRow({ event, checked, disabled, onToggle }: EventRowProps) {
    // `htmlFor` targeting the Switch: Radix renders it as a <button>, which is a
    // labelable element, so clicking the title toggles the row.
    const switchId = `notify-${idFor(event.id)}`;
    const style = EVENT_STYLES[event.id];
    const EventIcon = style.icon;

    return (
        <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex min-w-0 items-start gap-3">
                {/* Deadens when the event is off: an alert you will never get
                    should not look like one you will. The well goes flat and the
                    mark fades, but it keeps its hue — a group that ships off
                    would otherwise open as a column of identical grey squares,
                    which is where there is most to tell apart. */}
                <span
                    aria-hidden
                    className={cn(
                        'mac-squircle flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border',
                        'transition-colors duration-200 ease-mac',
                        checked
                            ? cn('border-hairline', style.well, style.tint)
                            : cn('border-hairline bg-white/[0.04]', style.dim)
                    )}
                >
                    <EventIcon className="h-4 w-4" />
                </span>

                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Label
                            htmlFor={switchId}
                            className={cn('cursor-pointer text-[13px] text-foreground', disabled && 'cursor-default')}
                        >
                            {event.label}
                        </Label>
                        {event.critical ? (
                            <span className="rounded-full border border-accent/40 bg-accent/12 px-2 py-0.5 text-[10px] font-medium text-accent">
                                Recommended
                            </span>
                        ) : null}
                        {/* Amber rather than grey: this is a warning about
                            volume, and it is the one thing on the row somebody
                            needs to read before flipping the switch. */}
                        {event.noisy ? (
                            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                                Every check
                            </span>
                        ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
                </div>
            </div>

            <Switch
                id={switchId}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => onToggle(event, next)}
                aria-label={event.label}
            />
        </div>
    );
}

/** Event ids carry a dot, which is not valid in the fragment of an id we build. */
function idFor(eventId: NotificationEventId): string {
    return eventId.replace(/\./g, '-');
}
