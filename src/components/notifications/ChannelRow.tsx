'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
    NOTIFICATION_CHANNEL_DESCRIPTIONS,
    type NotificationChannel,
} from '@/types/notification';

import { CHANNEL_STYLES } from './notification-display';

interface ChannelRowProps {
    channel: NotificationChannel;
    icon: LucideIcon;
    /** Whether this channel is actually delivering — the row's border says so. */
    lit: boolean;
    /** The state, in a few words. The channel's own description sits under it. */
    title: string;
    action: ReactNode;
}

/**
 * The one-line summary at the top of a channel's tab: what state it is in on the
 * left, the single control that changes that state on the right.
 *
 * Both channels use it, which is the point — they are the same kind of thing,
 * and the page reads as one surface rather than two features that happened to
 * land on the same route. It replaced a full-width panel per channel; the panels
 * said no more than this row does, at four times the height.
 */
export function ChannelRow({ channel, icon: Icon, lit, title, action }: ChannelRowProps) {
    const style = CHANNEL_STYLES[channel];

    return (
        <div
            className={cn(
                'gradient-card mac-squircle flex flex-col gap-3 rounded-xl border p-4',
                'sm:flex-row sm:items-center sm:justify-between',
                lit ? style.border : 'border-hairline'
            )}
        >
            <div className="flex min-w-0 items-center gap-3">
                <span
                    aria-hidden
                    className={cn(
                        'mac-squircle flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] border',
                        lit
                            ? cn(style.border, style.well, style.tint)
                            : 'border-hairline bg-white/[0.06] text-muted-foreground'
                    )}
                >
                    <Icon className="h-5 w-5" />
                </span>

                <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">{title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                        {NOTIFICATION_CHANNEL_DESCRIPTIONS[channel]}
                    </p>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">{action}</div>
        </div>
    );
}
