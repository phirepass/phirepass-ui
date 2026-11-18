import type { Migration } from './types';

/**
 * Continue watching: where each person stopped in each file (Remote Fetch T2.8).
 *
 * One row per person and file. file_key is dl:<download_id>:<file index> for a
 * download, or node:<node_id>:<absolute path> for a file in the SFTP listing.
 * It references nothing on purpose: a download row is retained for a while and
 * then removed, a listing path has no row at all, and a stale position costs
 * one prompt that the person can decline.
 *
 * Positions are per person and never shared, so the only key the API ever reads
 * by is (user_id, file_key) with user_id from the session. Removing the user
 * removes their positions.
 */
export const playbackPositions: Migration = {
    id: '009-playback-positions',
    description: 'playback_positions for Continue watching',
    sql: `
CREATE TABLE IF NOT EXISTS playback_positions (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_key text NOT NULL CHECK (char_length(file_key) BETWEEN 1 AND 4096),
    position_secs double precision NOT NULL CHECK (position_secs >= 0),
    duration_secs double precision NOT NULL CHECK (duration_secs >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, file_key)
);
`,
};
