import { NOTIFICATION_EVENTS, type NotificationPreferences } from '@/types/notification';

/**
 * Default event preferences.
 *
 * All that is left of what used to be `mockNotifications.ts`. Devices are real
 * now — they come from `push_subscriptions` via `/api/notifications/devices` —
 * but preferences have no column yet, so they start from these defaults on every
 * load and the page says as much rather than implying they were saved.
 */
export function createDefaultPreferences(): NotificationPreferences {
    return Object.fromEntries(
        NOTIFICATION_EVENTS.map((event) => [event.id, event.defaultEnabled])
    ) as NotificationPreferences;
}
