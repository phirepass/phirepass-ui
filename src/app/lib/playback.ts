/**
 * Continue watching (Remote Fetch T2.8): the rules and statements behind
 * `/api/playback`. Import-free so `playback.test.ts` checks the rules and
 * `playback.db.test.ts` runs the statements in Postgres.
 *
 * Every statement takes the caller's user id as `$1` and nothing else decides
 * whose row it is: a key alone never reaches another person's position.
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DOWNLOAD_KEY = new RegExp(`^dl:${UUID}:\\d{1,6}$`, 'i');
const NODE_KEY = new RegExp(`^node:${UUID}:/.*$`, 'is');
export const MAX_KEY = 4096;

/** `dl:<download_id>:<file index>` or `node:<node_id>:<absolute path>`. */
export function isFileKey(key: unknown): key is string {
    return typeof key === 'string' && key.length <= MAX_KEY && (DOWNLOAD_KEY.test(key) || NODE_KEY.test(key));
}

/** Copies of the player's rule (`positionAction` in phirepass-widgets). */
export const SKIP_FIRST_SECS = 30;
export const WATCHED_FRACTION = 0.95;
export const WATCHED_TAIL_SECS = 120;

export type Save = { kind: 'save'; secs: number; duration: number } | { kind: 'clear' } | { kind: 'ignore' };

/**
 * What a reported position does: nothing in the first 30 s, cleared past 95%
 * or within the last 2 minutes, otherwise saved. The server applies it too, so
 * an older player cannot store what the rule says to drop.
 */
export function judge(secs: unknown, duration: unknown): Save | null {
    if (typeof secs !== 'number' || typeof duration !== 'number' || !Number.isFinite(secs) || !Number.isFinite(duration) || secs < 0 || duration < 0) {
        return null;
    }
    if (secs < SKIP_FIRST_SECS) {
        return { kind: 'ignore' };
    }
    if (duration > 0 && (secs >= duration * WATCHED_FRACTION || duration - secs <= WATCHED_TAIL_SECS)) {
        return { kind: 'clear' };
    }
    return { kind: 'save', secs, duration };
}

export const GET_SQL = `SELECT position_secs AS secs, duration_secs AS duration,
    (extract(epoch FROM updated_at) * 1000)::float8 AS at
    FROM playback_positions WHERE user_id = $1 AND file_key = $2`;

export const SAVE_SQL = `INSERT INTO playback_positions (user_id, file_key, position_secs, duration_secs, updated_at)
    VALUES ($1, $2, $3, $4, now())
    ON CONFLICT (user_id, file_key) DO UPDATE
    SET position_secs = EXCLUDED.position_secs, duration_secs = EXCLUDED.duration_secs, updated_at = now()`;

export const CLEAR_SQL = `DELETE FROM playback_positions WHERE user_id = $1 AND file_key = $2`;
