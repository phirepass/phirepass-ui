/**
 * Notification settings.
 *
 * Two delivery channels, named as the courier names them
 * (phirepass-rs/common/src/notifications.rs, `NotificationKind`): `web.push`
 * reaches a person at a browser that granted permission, `webhook` reaches a
 * system at a URL it was given. One catalogue of events feeds both — the
 * preferences below decide *whether* something is worth sending, and the
 * destinations decide where it lands.
 *
 * Subscriptions, endpoints and preferences are all real —
 * `notification_subscriptions`, `notification_webhooks` and
 * `notification_preferences` in docs/notifications-schema.sql. What does not
 * exist is a *dispatcher*: nothing watches for these conditions and sends, so
 * the only thing that delivers today is the manual test in
 * `/api/notifications/test`.
 *
 * The catalogue below is deliberately two events long. Agent connect and disconnect are the only
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

/**
 * How a notification travels. The string values are the courier's `kind`
 * values verbatim, so a channel named in this UI is the same token that ends
 * up on the wire — `email` is deliberately absent, because nothing in this app
 * can register an address for it yet.
 */
export type NotificationChannel = 'web.push' | 'webhook';

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
    'web.push': 'Web push',
    webhook: 'Webhooks',
};

/**
 * What each channel is, in one short line. Deliberately parallel — the two are
 * read one under the other on the same row of the same card, so they differ in
 * their nouns and nothing else.
 */
export const NOTIFICATION_CHANNEL_DESCRIPTIONS: Record<NotificationChannel, string> = {
    'web.push': 'Reaches a person, at a browser that granted permission.',
    webhook: 'Reaches a system, at a URL. No permission involved.',
};

/** One group of related events. One for now; see the note above. */
export type NotificationCategory = 'nodes';

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
    nodes: 'Nodes',
};

export const NOTIFICATION_CATEGORY_DESCRIPTIONS: Record<NotificationCategory, string> = {
    nodes: 'Agents disconnecting from server, and coming back to it.',
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
        description: 'The agent reconnects after a restart or an outage.',
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
 *
 * The view model behind a row in the device list, assembled from
 * `GET /api/notifications/devices` — see `docs/notifications-schema.sql` for
 * what is actually stored.
 */
export interface RegisteredDevice {
    id: string;
    /**
    * sha-256 of the push endpoint, truncated. The endpoint itself is a
    * capability URL and never leaves the server; this is what lets the page
    * work out which row is the browser it is running in.
    */
    endpoint_hash: string;
    /** Display label, seeded from the user agent at registration. */
    name: string;
    platform: DevicePlatform;
    browser: string;
    registered_at: string;
    /** Last time this subscription was confirmed still valid. */
    last_active_at: string;
    /** Derived on the client by matching `endpoint_hash`; never sent by the API. */
    is_current: boolean;
}

/**
 * One webhook endpoint, as a row in the webhook list — assembled from
 * `GET /api/notifications/webhooks`; see `docs/notifications-schema.sql` for
 * what is actually stored.
 *
 * The secret is absent by design. It exists to let the receiver verify the
 * `X-Phirepass-Signature` header, so it is shown once when the endpoint is
 * created (or rotated) and never returned by a list — a settings page that
 * hands out every signing key on load is a settings page that leaks them to
 * anything that gets a session.
 */
export interface WebhookEndpoint {
    id: string;
    /** Display label, defaulted to the URL's host when the person leaves it blank. */
    name: string;
    url: string;
    /** Last four characters of the secret. Enough to tell two apart, useless alone. */
    secret_hint: string;
    /** Paused endpoints keep their URL and secret, and receive nothing. */
    enabled: boolean;
    created_at: string;
    /** All three are null until something has actually been sent to this URL. */
    last_sent_at: string | null;
    last_status: number | null;
    last_error: string | null;
    /** Consecutive failures. Any 2xx resets it. */
    fail_count: number;
}

/** What the list shows for an endpoint: never tried, delivering, or failing. */
export type WebhookHealth = 'untested' | 'healthy' | 'failing';

export function webhookHealth(endpoint: WebhookEndpoint): WebhookHealth {
    if (endpoint.last_sent_at === null) return 'untested';
    // The status is what the receiver answered; `fail_count` is how many times
    // in a row it has answered badly. Either one being wrong is enough.
    const ok = endpoint.last_status !== null
        && endpoint.last_status >= 200
        && endpoint.last_status < 300;
    return ok && endpoint.fail_count === 0 ? 'healthy' : 'failing';
}
