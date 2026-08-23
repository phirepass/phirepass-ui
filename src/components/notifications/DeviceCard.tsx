'use client';

import { Clock, Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { RegisteredDevice } from '@/types/notification';

import {
    DEVICE_PLATFORM_STYLES,
    STALE_DEVICE_DAYS,
    describeDevice,
    formatDate,
    formatRelativeTime,
    isStaleDevice,
} from './notification-display';

interface DeviceCardProps {
    device: RegisteredDevice;
    /** True while delivery is paused account-wide; the card dims but stays legible. */
    paused: boolean;
    onRename: (device: RegisteredDevice) => void;
    onRevoke: (device: RegisteredDevice) => void;
}

/**
 * One push subscription, as a card in a grid rather than a row in a list.
 *
 * The grid is what every other surface in this dashboard uses — nodes,
 * monitors, tokens, servers — and a device has the same shape of content they
 * do: an identity, a state, and two timestamps. It also gives the platform hue
 * somewhere to live beyond a 36px square: the bloom in the corner is the same
 * colour as the icon, so a phone and a laptop are distinguishable from across
 * the room, before any text is read.
 */
export function DeviceCard({ device, paused, onRename, onRevoke }: DeviceCardProps) {
    const platform = DEVICE_PLATFORM_STYLES[device.platform];
    const Icon = platform.icon;
    const stale = isStaleDevice(device);

    return (
        <article
            className={cn(
                'gradient-card mac-squircle group relative flex h-full min-h-[147px] flex-col overflow-hidden rounded-xl border',
                'transition-[box-shadow,border-color,opacity] duration-200 ease-mac hover:shadow-window-raised',
                device.is_current
                    ? 'border-accent/30 hover:border-accent/50'
                    : 'border-hairline hover:border-hairline-strong',
                paused && 'opacity-60'
            )}
        >
            {/* Platform bloom. Blurred well past its own bounds so it reads as
                light in the corner of the card rather than a shape on it. */}
            <div
                aria-hidden
                className={cn(
                    'pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full blur-2xl',
                    'opacity-90 transition-opacity duration-300 ease-mac group-hover:opacity-100',
                    platform.bloom
                )}
            />

            <div className="relative flex flex-1 items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 items-start gap-3">
                    <span
                        aria-hidden
                        className={cn(
                            'mac-squircle flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-hairline',
                            platform.well,
                            platform.tint
                        )}
                    >
                        <Icon className="h-5 w-5" />
                    </span>

                    <div className="min-w-0">
                        <p className="truncate font-medium tracking-[-0.01em] text-foreground">
                            {device.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{describeDevice(device)}</p>

                        {device.is_current || stale ? (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {device.is_current ? (
                                    <span className="rounded-full border border-accent/40 bg-accent/12 px-2 py-0.5 text-[10px] font-medium text-accent">
                                        This device
                                    </span>
                                ) : null}
                                {stale ? (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                                                <Clock className="h-3 w-3" />
                                                Stale
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            No confirmation in {STALE_DEVICE_DAYS}+ days — the browser has
                                            most likely dropped this subscription already.
                                        </TooltipContent>
                                    </Tooltip>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full border border-transparent text-muted-foreground transition-colors hover:border-hairline hover:text-foreground"
                                aria-label={`Rename ${device.name}`}
                                onClick={() => onRename(device)}
                            >
                                <Pencil className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Rename this device</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full border border-transparent text-muted-foreground transition-colors hover:border-hairline hover:text-destructive"
                                aria-label={`Revoke notifications for ${device.name}`}
                                onClick={() => onRevoke(device)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Revoke this subscription</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            <div className="relative mt-auto flex h-11 items-center justify-between gap-3 border-t border-hairline px-4">
                <span className="text-[11px] text-muted-foreground">
                    Registered {formatDate(device.registered_at)}
                </span>
                <span className={cn('text-[11px] font-medium', stale ? 'text-warning' : 'text-muted-foreground')}>
                    {formatRelativeTime(device.last_active_at)}
                </span>
            </div>
        </article>
    );
}
