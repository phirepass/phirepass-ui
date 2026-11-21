import {
    CircleAlert,
    CircleCheck,
    CircleDot,
    Laptop,
    Monitor,
    Smartphone,
    Terminal,
    TriangleAlert,
    Webhook,
    Wifi,
    WifiOff,
    type LucideIcon,
} from 'lucide-react';

import {
    DEVICE_PLATFORM_LABELS,
    type DevicePlatform,
    type NotificationCategory,
    type NotificationChannel,
    type NotificationEventId,
    type RegisteredDevice,
    type WebhookEndpoint,
    type WebhookHealth,
} from '@/types/notification';

/**
 * Per-channel mark and hue — the one visual difference between the two halves
 * of this page.
 *
 * Accent for push and violet for webhooks, rather than two shades of the same
 * hue: the sections are read in sequence, not compared side by side, so what
 * matters is that a screenshot of one is instantly tellable from a screenshot
 * of the other. Written out in full because Tailwind cannot resolve class names
 * assembled at runtime.
 */
export const CHANNEL_STYLES: Record<
    NotificationChannel,
    { icon: LucideIcon; tint: string; well: string; border: string; bloom: string }
> = {
    'web.push': {
        icon: Smartphone,
        tint: 'text-accent',
        well: 'bg-accent/12',
        border: 'border-accent/30',
        bloom: 'bg-accent/25',
    },
    webhook: {
        icon: Webhook,
        tint: 'text-violet',
        well: 'bg-violet/12',
        border: 'border-violet/30',
        bloom: 'bg-violet/25',
    },
};

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
    // The hue the monitor pages already use for an HTTP check, so the group
    // header is recognisably about the same feature.
    monitors: { icon: 'text-info', well: 'bg-info/10' },
};

/**
 * Per-event mark and hue.
 *
 * The colour is the event's *outcome*, not its category: the thing going wrong
 * is red and the thing coming right is green, which is the same vocabulary the
 * node cards and monitor cards already use for online and offline. It means a
 * row can be read before the label is, and it is what keeps the preference list
 * from being a column of identical grey switches.
 *
 * `dim` is that same hue for a switched-off row. An off event used to render its
 * mark in flat grey, which was fine while the one category shipped on and a grey
 * row was the exception — but the monitor events ship off, so the whole group
 * opened as a column of identical grey squares and the colour vocabulary bought
 * nothing exactly where there was most to tell apart. Faded keeps the row
 * legible as *off* while the mark still says which event it is.
 */
export const EVENT_STYLES: Record<
    NotificationEventId,
    { icon: LucideIcon; tint: string; dim: string; well: string }
> = {
    'node.offline': { icon: WifiOff, tint: 'text-destructive', dim: 'text-destructive/45', well: 'bg-destructive/12' },
    'node.online': { icon: Wifi, tint: 'text-success', dim: 'text-success/45', well: 'bg-success/12' },
    // Red, amber, green — the same three the monitor status dot uses, so a row
    // here and a card on /dashboard/monitors agree on what each state looks
    // like. `degraded` is the reason this scale has three colours rather than
    // two: slow is neither broken nor fine.
    'monitor.down': { icon: TriangleAlert, tint: 'text-destructive', dim: 'text-destructive/45', well: 'bg-destructive/12' },
    // Not a speedometer: `degraded` is a slow response *or* an expiry inside
    // its warning window, and a gauge would name only the first.
    'monitor.degraded': { icon: CircleAlert, tint: 'text-warning', dim: 'text-warning/45', well: 'bg-warning/12' },
    'monitor.up': { icon: CircleCheck, tint: 'text-success', dim: 'text-success/45', well: 'bg-success/12' },
    // Deliberately not green: this one is not a verdict about health, it is a
    // heartbeat. Colouring it like a recovery would put two very different
    // meanings behind the same mark.
    'monitor.success': { icon: CircleDot, tint: 'text-info', dim: 'text-info/45', well: 'bg-info/12' },
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
 * The height of a single destination card, as a Tailwind class.
 *
 * Both cards claim it as their floor, and every container that can hold them —
 * the grids, and the loading and empty states that stand in for a grid — claims
 * it too. That is the point: the destination area is one card tall before the
 * fetch resolves, so the page does not jump when it does.
 */
export const DESTINATION_CARD_MIN_HEIGHT = 'min-h-[147px]';

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

/**
 * How an endpoint's last attempt reads in the list.
 *
 * Three states rather than two, because "never tried" is not a kind of failure
 * and colouring it as one would have every freshly added endpoint arrive
 * looking broken. The wording is about the *endpoint*, not about us: a receiver
 * answering 500 is not our delivery failing, it is theirs refusing.
 */
export const WEBHOOK_HEALTH_STYLES: Record<
    WebhookHealth,
    { label: string; tint: string; well: string; border: string }
> = {
    untested: {
        label: 'Not delivered yet',
        tint: 'text-muted-foreground',
        well: 'bg-white/[0.06]',
        border: 'border-hairline',
    },
    healthy: {
        label: 'Delivering',
        tint: 'text-success',
        well: 'bg-success/12',
        border: 'border-success/40',
    },
    failing: {
        label: 'Failing',
        tint: 'text-destructive',
        well: 'bg-destructive/12',
        border: 'border-destructive/40',
    },
};

/** The one-line account of the last attempt, under the URL. */
export function describeWebhookDelivery(endpoint: WebhookEndpoint): string {
    if (endpoint.last_sent_at === null) {
        return 'Nothing has been sent to this URL yet';
    }

    const when = formatRelativeTime(endpoint.last_sent_at);

    if (endpoint.last_status === null) {
        // No status at all means the request never reached a receiver — DNS,
        // refused, TLS, timeout — and `last_error` is the transport's own words.
        return `${endpoint.last_error ?? 'No response'} · ${when}`;
    }

    const streak = endpoint.fail_count > 1 ? ` · ${endpoint.fail_count} in a row` : '';
    return `HTTP ${endpoint.last_status} · ${when}${streak}`;
}

/**
 * The URL with its scheme dropped, for display only.
 *
 * `https://` is the same on every row and is the first thing the eye hits;
 * removing it puts the host — the part that differs — at the start of the line.
 * The full URL stays in the tooltip and in the edit form.
 */
export function displayUrl(url: string): string {
    return url.replace(/^https?:\/\//, '');
}
