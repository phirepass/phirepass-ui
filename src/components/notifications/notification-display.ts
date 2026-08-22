import { Laptop, Monitor, Smartphone, Terminal, Wifi, WifiOff, type LucideIcon } from 'lucide-react';

import {
    DEVICE_PLATFORM_LABELS,
    type DevicePlatform,
    type NotificationCategory,
    type NotificationEventId,
    type RegisteredDevice,
} from '@/types/notification';

/**
 * Per-platform mark and hue.
 *
 * Lucide carries no vendor logos, so the icon says what *kind* of machine it is
 * rather than whose — and two platforms share a glyph (both phones are
 * `Smartphone`), which is exactly why the tint is here: it is the only thing
 * separating an iPhone row from an Android one at a glance.
 *
 * Hues are spaced around the wheel rather than assigned by brand, so that
 * neighbouring rows stay tellable apart at 16px: 205 → 265 → 322 leaves the
 * three "personal computer" platforms clearly distinct, and the two greens are
 * kept away from each other by putting Linux on amber. Written out in full
 * because Tailwind cannot resolve class names assembled at runtime.
 */
export const DEVICE_PLATFORM_STYLES: Record<
    DevicePlatform,
    { icon: LucideIcon; tint: string; well: string; bloom: string }
> = {
    macos: { icon: Laptop, tint: 'text-info', well: 'bg-info/12', bloom: 'bg-info/25' },
    windows: { icon: Monitor, tint: 'text-violet', well: 'bg-violet/12', bloom: 'bg-violet/25' },
    linux: { icon: Terminal, tint: 'text-warning', well: 'bg-warning/12', bloom: 'bg-warning/20' },
    ios: { icon: Smartphone, tint: 'text-pink', well: 'bg-pink/12', bloom: 'bg-pink/25' },
    android: { icon: Smartphone, tint: 'text-lime', well: 'bg-lime/12', bloom: 'bg-lime/22' },
};

/** Per-category icon tint, written out in full because Tailwind cannot resolve
 *  class names assembled at runtime. */
export const CATEGORY_STYLES: Record<NotificationCategory, { icon: string; well: string }> = {
    nodes: { icon: 'text-accent', well: 'bg-accent/10' },
};

/**
 * Per-event mark and hue.
 *
 * The colour is the event's *outcome*, not its category: the thing going wrong
 * is red and the thing coming right is green, which is the same vocabulary the
 * node cards and monitor cards already use for online and offline. It means a
 * row can be read before the label is, and it is what keeps the preference list
 * from being a column of identical grey switches.
 */
export const EVENT_STYLES: Record<
    NotificationEventId,
    { icon: LucideIcon; tint: string; well: string }
> = {
    'node.offline': { icon: WifiOff, tint: 'text-destructive', well: 'bg-destructive/12' },
    'node.online': { icon: Wifi, tint: 'text-success', well: 'bg-success/12' },
};

export function describeDevice(device: RegisteredDevice): string {
    return `${device.browser} on ${DEVICE_PLATFORM_LABELS[device.platform]}`;
}

/**
 * Duplicated per feature folder rather than shared, matching `user-display.ts`,
 * `server-display.ts` and `monitor-display.ts` — each surface has so far wanted
 * its own thresholds, and pulling them together is a refactor of all four.
 */
export function formatRelativeTime(iso: string | null): string {
    if (!iso) return 'never';

    const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
}

export function formatDate(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString() : '—';
}

/**
 * A subscription quiet long enough to be worth pruning. Sixty days rather than
 * the ninety used for dormant *accounts*: a push subscription that has not been
 * confirmed in two months has usually already been invalidated by the browser,
 * so it is dead weight rather than merely idle.
 */
export const STALE_DEVICE_DAYS = 60;

export function isStaleDevice(device: RegisteredDevice): boolean {
    const days = (Date.now() - new Date(device.last_active_at).getTime()) / (24 * 60 * 60 * 1000);
    return days >= STALE_DEVICE_DAYS;
}

export interface CurrentDeviceIdentity {
    name: string;
    platform: DevicePlatform;
    browser: string;
}

/**
 * Best-effort identity for the browser this page is open in, used to label the
 * subscription that enabling creates.
 *
 * User-agent sniffing, deliberately: the modern replacement
 * (`navigator.userAgentData`) is Chromium-only and its platform field is behind
 * a permission prompt, which is far more than a display label is worth. Nothing
 * downstream depends on this being right — a wrong guess produces a slightly
 * wrong name on a row the person can rename.
 */
export function detectCurrentDevice(): CurrentDeviceIdentity {
    if (typeof navigator === 'undefined') {
        return { name: 'This browser', platform: 'linux', browser: 'Browser' };
    }

    const ua = navigator.userAgent;

    const platform: DevicePlatform =
        /iPhone|iPad|iPod/i.test(ua) ? 'ios'
        : /Android/i.test(ua) ? 'android'
        // Order matters: every Chrome UA on any platform contains "like Mac OS X"
        // somewhere, so mobile has to be ruled out before this test.
        : /Macintosh|Mac OS X/i.test(ua) ? 'macos'
        : /Windows/i.test(ua) ? 'windows'
        : 'linux';

    // Also order-dependent: Edge and Opera both claim to be Chrome, and Chrome
    // claims to be Safari.
    const browser =
        /Edg\//i.test(ua) ? 'Edge'
        : /OPR\//i.test(ua) ? 'Opera'
        : /Firefox\//i.test(ua) ? 'Firefox'
        : /Chrome\//i.test(ua) ? 'Chrome'
        : /Safari\//i.test(ua) ? 'Safari'
        : 'Browser';

    return {
        name: `This ${DEVICE_PLATFORM_LABELS[platform]} device`,
        platform,
        browser,
    };
}
