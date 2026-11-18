import { LIVE_SHARE } from './scope.ts';

/**
 * Which downloads a session may see: the dashboard's copy of the rule the Rust
 * server applies before it sends a `DownloadProgress` (`may_use_record` with
 * `FETCH`, over `reach` in `server/src/access.rs`).
 *
 * A download is visible through its **node**, never through who asked for it:
 *
 * - an unclaimed node (no organisation) answers to its owner only;
 * - otherwise the node is in the caller's organisation **and** the caller owns
 *   it, reaches the whole organisation (`nodes:manage:all`: owner and admin), or
 *   holds a live share that opens Downloads. A share that names no services
 *   opens every one, Downloads included; a share naming others does not.
 *
 * So a member lent a node for SSH alone does not see what is downloaded on it,
 * which is what the server refuses too.
 *
 * Pure and import-free apart from `scope.ts`, so `downloads-scope.test.ts`
 * checks its shape and `downloads-scope.db.test.ts` runs it in Postgres.
 *
 * Parameters: `$1` organisation (may be null), `$2` reaches the whole
 * organisation, `$3` the caller's user id.
 */
export interface DownloadsShape {
    orgId: string | null;
    userId: string;
    /** `can(role, 'nodes:manage:all')`, the dashboard's name for `reaches_whole_org`. */
    managesAll: boolean;
}

export function downloadsVisible(shape: DownloadsShape, nodeAlias = 'n'): { sql: string; params: unknown[] } {
    const n = `${nodeAlias}.`;
    return {
        sql: `((${n}org_id IS NULL AND ${n}user_id = $3)
               OR (${n}org_id = $1
                   AND ($2::boolean
                        OR ${n}user_id = $3
                        OR EXISTS (
                            SELECT 1 FROM node_shares s
                             WHERE s.node_id = ${n}id
                               AND s.org_id = $1
                               AND ${LIVE_SHARE}
                               AND (s.audience = 'org' OR s.grantee_id = $3)
                               AND (cardinality(s.services) = 0
                                    OR EXISTS (SELECT 1 FROM unnest(s.services) AS k
                                                WHERE upper(btrim(k)) = 'FETCH'))))))`,
        params: [shape.orgId, shape.managesAll, shape.userId],
    };
}

/**
 * The rows the Downloads page lists, newest first, with the node's name and
 * owner. Progress columns are newer than `job` (the server flushes them every
 * 5 seconds and rewrites `job` only on a state change), so both are returned
 * and `mergeRow` in `download-display.ts` lays the columns over the job.
 * A row somebody deleted stays until the node confirms, shown as deleting.
 */
export function downloadsQuery(shape: DownloadsShape): { sql: string; params: unknown[] } {
    const visible = downloadsVisible(shape, 'n');
    return {
        sql: `SELECT d.id, d.node_id, n.name AS node_name, d.wanted, d.state, d.job,
                     d.done_bytes, d.total_bytes, d.down_bps, d.up_bps, d.peers,
                     d.attempt, d.retry_reason, d.next_attempt_at, d.updated_at, d.finished_at
                FROM downloads d
                JOIN nodes n ON n.id = d.node_id
               WHERE ${visible.sql}
               ORDER BY d.created_at DESC
               LIMIT 500`,
        params: visible.params,
    };
}
