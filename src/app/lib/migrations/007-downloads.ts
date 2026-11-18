import { RETENTION_JOB, RETENTION_SQL } from '../download-retention';
import type { Migration } from './types';

/**
 * Remote Fetch: one row per download a node has been asked to make.
 *
 * Only the Rust server writes this table (server/src/db/downloads.rs). The
 * dashboard reads it for the Downloads page and never writes it: every change a
 * person makes travels as an event over the WebSocket, so the server can check
 * access, bump cmd_seq and command the node in one place.
 *
 * **wanted / cmd_seq / cmd_acked** are the delivery contract. The server writes
 * what the person wants and bumps cmd_seq in the statement that accepts the
 * event, then sends the command. The agent reports the last cmd_seq it applied,
 * and on reconnect the server re-sends anything above it. command holds the
 * latest command, which for a fresh row is its Start.
 *
 * **source / target / command / job** are jsonb copies of the wire types
 * (common/src/protocol/fetch.rs). source never holds a link login: those are
 * stored only as sealed_auth, the ciphertext the node sealed them into.
 *
 * **Progress columns** (done_bytes, down_bps and the rest) are rewritten every
 * 5 seconds while a download moves, in one batched UPDATE. They carry no index
 * and the table keeps 30% of each page free (fillfactor 70), so those updates
 * stay HOT and do not bloat the table or its indexes.
 *
 * **node_download_policy** is the organisation's ceiling over a node's
 * Downloads and Torrents switches (T1.15): allowed, links_only or blocked.
 * No row means allowed. Only owners and admins write it
 * (`/api/nodes/download-policy`); the server reads it at first use and on
 * every access sweep, and enforces it.
 *
 * **announced_completed / announced_stuck / retrying_since / retry_bytes**
 * (T1.22): download.completed and download.stuck go out once per row, each
 * claimed by one UPDATE (server/src/db/download_notices.rs). The stuck clock
 * starts on the first Retrying and restarts only when bytes have arrived.
 *
 * **node_download_settings** (T1.21) is a node's Downloads panel. Only the
 * server writes it: a save travels over the WebSocket, the server checks who
 * may configure the node and the ranges, bumps version and sends the settings
 * to the node, whose answer sets applied_version or rejected ({ version,
 * field, reason }). No row means the defaults, which keep everything off.
 *
 * **organization_download_settings** (T1.21) is Organisation → Downloads:
 * keep_days (retention) and stream_link_hours. A missing key is its default.
 * Written by owners and admins through /api/org/download-settings.
 *
 * **Retention** (T1.16): a daily pg_cron job deletes finished rows older
 * than the organisation's keep_days (30 by default), never running or seeding ones and never files
 * (`download-retention.ts`). Optional like every pg_cron job here: where the
 * extension is missing the rows simply stay.
 */
export const downloads: Migration = {
    id: '007-downloads',
    description: 'downloads: Remote Fetch rows, written by the server; node_download_policy',
    sql: `
CREATE TABLE IF NOT EXISTS downloads (
    id              uuid PRIMARY KEY,
    node_id         uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    org_id          uuid REFERENCES organizations(id) ON DELETE CASCADE,
    requested_by    uuid REFERENCES users(id) ON DELETE SET NULL,
    kind            text NOT NULL,
    source          jsonb NOT NULL,
    target          jsonb NOT NULL,
    in_order        boolean NOT NULL DEFAULT true,
    wanted          text NOT NULL DEFAULT 'running'
                    CHECK (wanted IN ('running', 'stopped', 'deleted')),
    command         jsonb NOT NULL,
    cmd_seq         bigint NOT NULL DEFAULT 1,
    cmd_acked       bigint NOT NULL DEFAULT 0,
    cmd_sent_at     timestamptz,
    state           text NOT NULL DEFAULT 'Queued',
    progress_seq    bigint NOT NULL DEFAULT 0,
    job             jsonb NOT NULL,
    name            text NOT NULL DEFAULT '',
    done_bytes      bigint NOT NULL DEFAULT 0,
    total_bytes     bigint,
    down_bps        bigint NOT NULL DEFAULT 0,
    up_bps          bigint NOT NULL DEFAULT 0,
    peers           integer NOT NULL DEFAULT 0,
    up_total        bigint NOT NULL DEFAULT 0,
    dest_root       text,
    sub_dir         text,
    torrent_meta    bytea,
    sealed_auth     bytea,
    attempt         integer NOT NULL DEFAULT 0,
    retry_reason    text,
    next_attempt_at timestamptz,
    reason          text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz
) WITH (fillfactor = 70);

CREATE INDEX IF NOT EXISTS downloads_node_idx ON downloads (node_id);
CREATE INDEX IF NOT EXISTS downloads_org_idx ON downloads (org_id);
CREATE INDEX IF NOT EXISTS downloads_unacked_idx ON downloads (node_id)
    WHERE cmd_seq > cmd_acked;

CREATE TABLE IF NOT EXISTS node_download_policy (
    node_id     uuid PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    policy      text NOT NULL DEFAULT 'allowed'
                CHECK (policy IN ('allowed', 'links_only', 'blocked')),
    changed_by  uuid REFERENCES users(id) ON DELETE SET NULL,
    changed_at  timestamptz NOT NULL DEFAULT now()
);

-- T1.22: the courier notices, claimed once each, and the clock that says
-- a download is stuck (24 hours of retrying without a byte arriving).
ALTER TABLE downloads ADD COLUMN IF NOT EXISTS announced_completed boolean NOT NULL DEFAULT false;
ALTER TABLE downloads ADD COLUMN IF NOT EXISTS announced_stuck boolean NOT NULL DEFAULT false;
ALTER TABLE downloads ADD COLUMN IF NOT EXISTS retrying_since timestamptz;
ALTER TABLE downloads ADD COLUMN IF NOT EXISTS retry_bytes bigint;

CREATE TABLE IF NOT EXISTS node_download_settings (
    node_id          uuid PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    settings         jsonb NOT NULL,
    version          integer NOT NULL DEFAULT 0,
    applied_version  integer NOT NULL DEFAULT 0,
    rejected         jsonb,
    changed_by       uuid REFERENCES users(id) ON DELETE SET NULL,
    changed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_download_settings (
    org_id      uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
    changed_by  uuid REFERENCES users(id) ON DELETE SET NULL,
    changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS downloads_finished_idx ON downloads (finished_at)
    WHERE finished_at IS NOT NULL;

DO $cron$
BEGIN
    -- Scheduling by name replaces an existing job, so a changed statement
    -- reaches databases that already had the job.
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('${RETENTION_JOB}', '17 3 * * *', $job$${RETENTION_SQL};$job$);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'could not schedule the download retention job: %', SQLERRM;
END
$cron$;
`,
};
