import {
    NOTIFICATION_EVENTS,
    type DevicePlatform,
    type NotificationPreferences,
    type RegisteredDevice,
} from '@/types/notification';

/**
 * Sample push subscriptions and saved preferences for the notifications page.
 *
 * There is no API behind this yet — see the note in `src/types/notification.ts`.
 * Timestamps derive from a `now` passed in by the caller so the set is built
 * once on mount instead of drifting per render, matching `mockUsers.ts`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

interface DeviceSpec {
    id: string;
    name: string;
    platform: DevicePlatform;
    browser: string;
    registeredDaysAgo: number;
    lastActiveHoursAgo: number;
}

/**
 * Deliberately covers the states the list has to render: two phones on
 * different platforms, a desktop that is used during the week, and one
 * subscription that has gone quiet for months and is worth pruning. None is the
 * current browser —
 * registering *this* one is what the enable button does, so the empty-current
 * case is the one you land on.
 */
const SPECS: DeviceSpec[] = [
    {
        id: 'dev-01',
        name: 'iPhone 15 Pro',
        platform: 'ios',
        browser: 'Safari',
        registeredDaysAgo: 96,
        lastActiveHoursAgo: 3,
    },
    {
        id: 'dev-02',
        name: 'Studio desktop',
        platform: 'windows',
        browser: 'Edge',
        registeredDaysAgo: 141,
        lastActiveHoursAgo: 52,
    },
    {
        // Present specifically so the two phones sit next to each other: both
        // render the same `Smartphone` glyph, so this pair is the case the
        // per-platform tint exists to disambiguate. Without it that tint is
        // never exercised.
        id: 'dev-03',
        name: 'Pixel 9',
        platform: 'android',
        browser: 'Chrome',
        registeredDaysAgo: 62,
        lastActiveHoursAgo: 19,
    },
    {
        id: 'dev-04',
        name: 'Old work laptop',
        platform: 'linux',
        browser: 'Firefox',
        registeredDaysAgo: 288,
        lastActiveHoursAgo: 134 * 24,
    },
];

function specToDevice(spec: DeviceSpec, now: number): RegisteredDevice {
    return {
        id: spec.id,
        name: spec.name,
        platform: spec.platform,
        browser: spec.browser,
        registered_at: new Date(now - spec.registeredDaysAgo * DAY_MS).toISOString(),
        last_active_at: new Date(now - spec.lastActiveHoursAgo * HOUR_MS).toISOString(),
        is_current: false,
    };
}

export function createMockDevices(now: number = Date.now()): RegisteredDevice[] {
    return SPECS.map((spec) => specToDevice(spec, now));
}

/** A subscription created just now, for the browser this page is open in. */
export function createCurrentDevice(
    identity: { name: string; platform: DevicePlatform; browser: string },
    now: number = Date.now()
): RegisteredDevice {
    const stamp = new Date(now).toISOString();

    return {
        id: `dev-${Math.random().toString(36).slice(2, 8)}`,
        name: identity.name,
        platform: identity.platform,
        browser: identity.browser,
        registered_at: stamp,
        last_active_at: stamp,
        is_current: true,
    };
}

/** Every event at the state a brand-new account would find it in. */
export function createDefaultPreferences(): NotificationPreferences {
    return Object.fromEntries(
        NOTIFICATION_EVENTS.map((event) => [event.id, event.defaultEnabled])
    ) as NotificationPreferences;
}

/** Plausible delivery volume for the summary tile. */
export const MOCK_DELIVERED_LAST_7_DAYS = 34;
