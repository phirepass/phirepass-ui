'use client';

import { BellOff } from 'lucide-react';

import { PhirepassLogo } from '@/components/PhirepassLogo';
import { cn } from '@/lib/utils';
import {
    NOTIFICATION_EVENTS,
    type NotificationEventId,
    type NotificationPreferences,
} from '@/types/notification';

/**
 * A macOS notification banner, as it would arrive.
 *
 * This is the one place on the page where the settings above it become
 * something you can look at: it renders whichever enabled event is most
 * consequential, so switching "Node goes offline" off visibly changes what
 * would land on your lock screen. Turn everything off and it says so, rather
 * than disappearing — the empty state is the point being made.
 *
 * Sample copy is deliberately concrete ("synology", a real node name from the
 * fixtures) because a banner reading "Example title / Example body" teaches
 * nothing about whether the wording works at this width.
 */

interface PreviewCopy {
    title: string;
    body: string;
}

const PREVIEW_COPY: Record<NotificationEventId, PreviewCopy> = {
    'node.offline': {
        title: 'Node offline',
        body: 'synology stopped reporting 30 seconds ago.',
    },
    'node.online': {
        title: 'Node back online',
        body: 'synology reconnected to the relay after 4m 12s.',
    },
    // Worded as the courier words them (phirepass-rs/courier/src/render.rs), so
    // the banner rehearsed here is the banner that arrives.
    'monitor.down': {
        title: 'Monitor down',
        body: 'checkout-api failed its check: connection refused.',
    },
    // The `http` shape of a degraded verdict; an `ssl` or `domain` one reads
    // "Certificate expiring" / "example.com: certificate expires in 5 day(s)".
    'monitor.degraded': {
        title: 'Monitor slow',
        body: 'checkout-api answered in 8.2s, over its 1.5s threshold.',
    },
    'monitor.up': {
        title: 'Monitor recovered',
        body: 'checkout-api is passing its checks again.',
    },
    'monitor.success': {
        title: 'Check passed',
        body: 'checkout-api answered 200 in 0.4s.',
    },
};

/**
 * Which event to show. Ordered by the catalogue, which puts the failure ahead
 * of the recovery — the banner worth previewing is the one you would least want
 * to miss.
 */
function pickPreview(preferences: NotificationPreferences): NotificationEventId | null {
    const chosen = NOTIFICATION_EVENTS.find((event) => preferences[event.id]);
    return chosen ? chosen.id : null;
}

interface NotificationPreviewProps {
    preferences: NotificationPreferences;
    /** Dims the whole stack: this is what you *would* get, not what you get. */
    enabled: boolean;
    className?: string;
}

export function NotificationPreview({ preferences, enabled, className }: NotificationPreviewProps) {
    const previewId = pickPreview(preferences);
    const enabledCount = NOTIFICATION_EVENTS.filter((event) => preferences[event.id]).length;

    return (
        <div className={cn('relative w-full', className)}>
            {/* The peeking card behind, the way macOS stacks a group. Only when
                there is genuinely more than one kind of alert to stack. */}
            {previewId && enabledCount > 1 ? (
                <div
                    aria-hidden
                    className="mac-squircle absolute inset-x-3 -bottom-2 h-12 rounded-[14px] border border-hairline bg-[image:var(--fill-menu)] opacity-60 shadow-menu"
                />
            ) : null}

            {previewId ? (
                <div
                    className={cn(
                        'animate-banner-in mac-material mac-squircle relative rounded-[14px] border border-hairline',
                        'bg-[image:var(--fill-menu)] p-3 shadow-panel transition-opacity duration-300 ease-mac',
                        !enabled && 'opacity-55'
                    )}
                >
                    <div className="flex items-start gap-3">
                        <PhirepassLogo className="h-9 w-9 shrink-0" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                                <p className="text-[11px] font-medium text-muted-foreground">Phirepass</p>
                                <span className="shrink-0 text-[11px] text-muted-foreground">now</span>
                            </div>
                            <p className="mt-0.5 truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                                {PREVIEW_COPY[previewId].title}
                            </p>
                            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                                {PREVIEW_COPY[previewId].body}
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="mac-squircle flex items-center gap-3 rounded-[14px] border border-dashed border-hairline-strong bg-white/[0.02] p-3">
                    <span
                        aria-hidden
                        className="mac-squircle flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-white/[0.06] text-muted-foreground"
                    >
                        <BellOff className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground">Nothing would arrive</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            Every event is switched off.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
