import { query } from '@/app/lib/db';
import {
    NOTIFICATION_EVENTS,
    type NotificationEventId,
    type NotificationPreferences,
} from '@/types/notification';

/**
 * Event preferences, server half.
 *
 * What is stored is a set of *overrides*, not a complete answer: the row holds
 * only the events whose value the person has actually chosen, and everything
 * else falls back to `defaultEnabled` from the catalogue in code. That is what
 * lets a new event ship with a sensible default already applied to every
 * existing account without a backfill — see the note in
 * docs/notifications-schema.sql.
 *
 * The flip side is that the catalogue is the authority on which ids exist. Ids
 * that are no longer in it are dropped on read rather than surfaced, so
 * retiring an event does not leave a dead switch in anyone's settings.
 */

const KNOWN_IDS = new Set<string>(NOTIFICATION_EVENTS.map((event) => event.id));

function withDefaults(stored: Record<string, unknown>): NotificationPreferences {
    const resolved = {} as NotificationPreferences;

    for (const event of NOTIFICATION_EVENTS) {
        const override = stored[event.id];
        resolved[event.id] = typeof override === 'boolean' ? override : event.defaultEnabled;
    }

    return resolved;
}

export async function getPreferences(userId: string): Promise<NotificationPreferences> {
    const result = await query(
        'SELECT events FROM notification_preferences WHERE user_id = $1',
        [userId],
    );

    const stored = result.rows[0]?.events;
    return withDefaults(stored && typeof stored === 'object' ? stored : {});
}

/**
 * Replaces the whole set. Unknown ids are discarded rather than rejected — a
 * client sending a stale catalogue should still have its valid choices saved,
 * and the alternative is a 400 that the person cannot act on.
 */
export async function savePreferences(
    userId: string,
    incoming: Record<string, unknown>,
): Promise<NotificationPreferences> {
    const cleaned: Record<string, boolean> = {};

    for (const [id, value] of Object.entries(incoming)) {
        if (KNOWN_IDS.has(id) && typeof value === 'boolean') {
            cleaned[id as NotificationEventId] = value;
        }
    }

    const result = await query(
        `INSERT INTO notification_preferences (user_id, events)
            VALUES ($1, $2::jsonb)
        ON CONFLICT (user_id) DO UPDATE
                SET events = EXCLUDED.events,
                    updated_at = now()
            RETURNING events`,
        [userId, JSON.stringify(cleaned)],
    );

    return withDefaults(result.rows[0].events ?? {});
}
