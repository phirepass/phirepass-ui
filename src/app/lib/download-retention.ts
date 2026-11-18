/**
 * How long finished download rows are kept (T1.16, plan § Disk: retention).
 *
 * Rows only: files on the node are never touched. A row removed here is one
 * the node still remembers, and the server's reconcile tells the node to
 * forget it (`Delete { delete_file: false }`) the next time it connects.
 *
 * Kept: anything running or seeding (a seeding torrent is `Seeding`, never
 * `Completed`), and a row somebody asked to delete (`wanted = 'deleted'`),
 * which waits for the node to confirm whether its file went too.
 *
 * How long is the organisation's "Keep finished downloads for"
 * (`organization_download_settings.settings.keep_days`), or RETENTION_DAYS
 * where it has none.
 *
 * Import-free and backtick-free so the migration can embed it and
 * `download-retention.db.test.ts` can run it in Postgres.
 */

export const RETENTION_DAYS = 30;

export const RETENTION_SQL =
    "DELETE FROM downloads d WHERE d.state IN ('Completed', 'Cancelled') AND d.wanted <> 'deleted'"
    + ' AND d.finished_at < now() - make_interval(days => COALESCE(('
    + "SELECT (o.settings->>'keep_days')::int FROM organization_download_settings o WHERE o.org_id = d.org_id"
    + `), ${RETENTION_DAYS}))`;

export const RETENTION_JOB = 'phirepass-download-retention';
