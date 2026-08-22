/**
 * Push notification settings.
 *
 * There is nothing behind this yet — no `push_subscriptions` table, no VAPID
 * keys, no delivery worker. What *is* meant to outlive the mock is the
 * catalogue below.
 *
 * It is deliberately two events long. Agent connect and disconnect are the only
 * conditions the system can already report without building a detector first:
 * the server holds the agent's WebSocket, so it knows the moment one drops or
 * comes back, and the dashboard is already rendering that as `is_online` on
 * every node card. Everything else a notification could plausibly be about —
 * monitor transitions, certificate and domain expiry, disk and CPU thresholds,
 * new sign-ins, token lifecycle — needs something to watch for it and decide
 * when it has happened, and none of that exists. Listing those here would have
 * been a menu of switches wired to nothing.
 *
 * Adding one back is: an id in the union, an entry in `NOTIFICATION_EVENTS`,
 * and — if it belongs to a new group — a member of `NotificationCategory` plus
 * its label, description, icon (`EventPreferenceList`) and tint
 * (`notification-display`). The grouped list renders whatever it is given and
 * skips categories with no events, so it grows without further changes.
 */

/** One group of related events. One for now; see the note above. */
export type NotificationCategory = 'nodes';

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
    nodes: 'Nodes',
};

export const NOTIFICATION_CATEGORY_DESCRIPTIONS: Record<NotificationCategory, string> = {
    nodes: 'Agents dropping off the relay, and coming back to it.',
};

export type NotificationEventId = 'node.offline' | 'node.online';

export interface NotificationEventDefinition {
    id: NotificationEventId;
    category: NotificationCategory;
    label: string;
    /** What actually triggers it — written as a condition, not a feature blurb. */
    description: string;
    /** State for an account that has never touched this page. */
    defaultEnabled: boolean;
    /**
     * Marks an event whose whole point is to reach you when something is wrong.
     * Nothing is mandatory — the switch still works — but turning one off is
     * confirmed rather than silent.
     */
    critical?: boolean;
}

/** Ordered for reading: the failure first, then the recovery. */
export const NOTIFICATION_EVENTS: NotificationEventDefinition[] = [
    {
        id: 'node.offline',
        category: 'nodes',
        label: 'Node goes offline',
        description: 'An agent stops reporting for longer than its grace period.',
        defaultEnabled: true,
        critical: true,
    },
    {
        id: 'node.online',
        category: 'nodes',
        label: 'Node comes back online',
        description: 'The agent reconnects after an outage.',
        defaultEnabled: true,
    },
];

/** Which events are on. Complete by construction — every id has an answer. */
export type NotificationPreferences = Record<NotificationEventId, boolean>;

export type DevicePlatform = 'macos' | 'windows' | 'linux' | 'ios' | 'android';

export const DEVICE_PLATFORM_LABELS: Record<DevicePlatform, string> = {
    macos: 'macOS',
    windows: 'Windows',
    linux: 'Linux',
    ios: 'iOS',
    android: 'Android',
};

/**
 * One browser that has accepted a push subscription. The subscription is
 * per-browser, not per-person, which is why the same laptop appears twice if
 * you register in both Safari and Chrome.
 */
export interface RegisteredDevice {
    id: string;
    /** Editable label; seeded from the user agent at registration. */
    name: string;
    platform: DevicePlatform;
    browser: string;
    registered_at: string;
    /** Last time this subscription was confirmed still valid. */
    last_active_at: string;
    /** The browser this page is currently open in. */
    is_current: boolean;
}
