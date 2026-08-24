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
 * `notification_preferences` in docs/notifications-schema.sql — and so is the
 * delivery path: producers in the Rust server post to `phirepass-courier`,
 * which reads the preferences row this page writes, resolves the person into
 * the destinations they registered, and sends. This dashboard owns the
 * catalogue and the switches; nothing here does the sending, apart from the
 * manual test in `/api/notifications/test`.
 *
 * The catalogue holds only conditions something actually detects. Agent connect
 * and disconnect are the server's — it holds the agent's WebSocket, so it knows
 * the moment one drops or comes back. Monitor transitions are the uptime
 * scheduler's: `write_probe_result` already compares each verdict against the
 * last one that reached a verdict, which is what turns a run of failing checks
 * into a single `monitor.down`. Certificate and domain expiry, disk and CPU
 * thresholds, new sign-ins and token lifecycle are all absent for the same
 * reason the monitor events used to be — nothing watches for them yet, and
 * listing one here would be a switch wired to nothing.
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

/** One group of related events. See the note above for what earns a place. */
export type NotificationCategory = 'nodes' | 'monitors';

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
    nodes: 'Nodes',
    monitors: 'Monitors',
};

export const NOTIFICATION_CATEGORY_DESCRIPTIONS: Record<NotificationCategory, string> = {
    nodes: 'Agents disconnecting from server, and coming back to it.',
    monitors: 'Uptime checks failing, degrading, and coming right again.',
};

/**
 * Reading order for the grouped list, matching the dashboard's own nav.
 *
 * Lives here rather than beside the component that renders it because it is the
 * one part of the catalogue TypeScript cannot check: `NotificationCategory` is
 * exhaustive in every `Record` above, but this is a plain array, so a category
 * added and not listed here renders nowhere at all — its events silently
 * disappear from the settings page while every type still checks. The test file
 * beside this one is what closes that.
 */
export const NOTIFICATION_CATEGORY_ORDER: NotificationCategory[] = ['nodes', 'monitors'];

export type NotificationEventId =
    | 'node.offline'
    | 'node.online'
    | 'monitor.down'
    | 'monitor.degraded'
    | 'monitor.up'
    | 'monitor.success';

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
    /**
    * Marks an event that fires on every occurrence rather than on a change.
    *
    * The rest of the catalogue is edge-triggered: a run of failing checks is
    * one `monitor.down`, and nothing else arrives until the state changes back.
    * A noisy event has no such ceiling — its volume is one per check per
    * monitor, forever — so it is labelled in the list rather than left to be
    * discovered by a phone buzzing every fifteen minutes.
    */
    noisy?: boolean;
}

/**
 * Ordered for reading: within each group the failure comes first, then the
 * recovery, then anything that fires regardless of either.
 */
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
    {
        id: 'monitor.down',
        category: 'monitors',
        label: 'Monitor goes down',
        description: 'A check fails — the wrong status, a missing keyword, or no answer at all.',
        defaultEnabled: false,
        critical: true,
    },
    {
        id: 'monitor.degraded',
        category: 'monitors',
        label: 'Monitor degrades',
        // Deliberately not "slows down". `degraded` is one status carrying three
        // findings — a slow HTTP response, a certificate inside its expiry
        // window, a registration inside its — and naming it after the first left
        // the other two describing themselves as a latency problem.
        description: 'A check still passes, but not cleanly — a slow response, or a certificate or domain close to expiry.',
        defaultEnabled: false,
    },
    {
        id: 'monitor.up',
        category: 'monitors',
        label: 'Monitor recovers',
        description: 'A check passes cleanly again after failing or running slow.',
        defaultEnabled: false,
    },
    {
        id: 'monitor.success',
        category: 'monitors',
        label: 'Every successful check',
        description: 'Every check that passes, not only the ones that change something — how you confirm checks are actually running.',
        defaultEnabled: false,
        noisy: true,
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
