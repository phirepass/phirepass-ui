-- Uptime monitoring schema.
--
-- Design and reasoning live in phirepass-rs/MONITOR.md. In short: every check
-- runs from an agent. Postgres holds the schedule; each Rust server polls once a
-- minute for monitors whose agent it currently holds a WebSocket to, claims them
-- with FOR UPDATE SKIP LOCKED, sends a probe frame, and writes the result back.
-- Agents never touch this database.
--
-- There is no migration runner in either repo, so this file is applied by hand:
--
--     psql "$DATABASE_URL" -f docs/uptime-schema.sql
--
-- It is written to be re-runnable (IF NOT EXISTS throughout).

-- ─────────────────────────────────────────────────────────────────────────────
-- monitors — one row per saved check
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monitors (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    node_id          uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,

    name             text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    kind             text NOT NULL CHECK (kind IN ('http', 'ssl', 'domain')),
    target           text NOT NULL CHECK (length(target) BETWEEN 1 AND 2048),

    -- probe configuration
    interval_secs    integer   NOT NULL DEFAULT 300 CHECK (interval_secs >= 300),
    timeout_ms       integer   NOT NULL DEFAULT 10000
                                CHECK (timeout_ms BETWEEN 500 AND 120000),
    method           text      NOT NULL DEFAULT 'GET',
    expected_status  integer[] NOT NULL DEFAULT '{}',
    keyword          text,
    keyword_mode     text      NOT NULL DEFAULT 'contains'
                                CHECK (keyword_mode IN ('contains', 'absent')),
    follow_redirects boolean   NOT NULL DEFAULT true,
    degraded_ms      integer   NOT NULL DEFAULT 1500 CHECK (degraded_ms > 0),
    expiry_warn_days integer   NOT NULL DEFAULT 21
                                CHECK (expiry_warn_days BETWEEN 1 AND 365),
    paused           boolean   NOT NULL DEFAULT false,

    -- What an offline agent means for this monitor. false records `unknown` and
    -- stays quiet; true records `down` and alerts. The default must stay false —
    -- the opposite turns every agent upgrade into a wave of false outages across
    -- every monitor on that node.
    agent_offline_is_outage boolean NOT NULL DEFAULT false,

    -- scheduling. `next_check_at` carries both the schedule and the mutual
    -- exclusion: claiming a row is the same statement that pushes it forward.
    next_check_at    timestamptz NOT NULL,
    last_dispatch_at timestamptz,
    leased_by        uuid,

    -- last result, denormalised so the list endpoint needs no aggregate for the
    -- status tiles and card headers
    last_status      text CHECK (last_status IN ('up','degraded','down','unknown')),
    last_checked_at  timestamptz,
    last_latency_ms  integer,
    last_status_code integer,
    last_error       text,
    -- Why the last check reached the verdict it did, machine-readable. `error`
    -- carries the prose; this carries the category, so the UI can tell an agent
    -- timeout from an agent disconnect without matching on wording.
    last_reason      text,

    -- kind-specific findings, refreshed by each successful check
    cert_expires_at   timestamptz,
    cert_issuer       text,
    cert_subject      text,
    domain_expires_at timestamptz,
    domain_registrar  text,

    -- where the target resolved to, shaped as PublicIpLocation
    location         jsonb,

    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Drives the claim. Partial, because a paused row is never due.
CREATE INDEX IF NOT EXISTS monitors_due_idx  ON monitors (next_check_at) WHERE NOT paused;
CREATE INDEX IF NOT EXISTS monitors_user_idx ON monitors (user_id);
CREATE INDEX IF NOT EXISTS monitors_node_idx ON monitors (node_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- monitor_checks — one row per check performed
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monitor_checks (
    id          bigserial PRIMARY KEY,
    monitor_id  uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    checked_at  timestamptz NOT NULL,
    status      text NOT NULL CHECK (status IN ('up','degraded','down','unknown')),
    latency_ms  integer,
    status_code integer,
    error       text,
    reason      text
);

-- INCLUDE lets the 30-day aggregate run index-only rather than fetching every
-- heap tuple for two columns.
CREATE INDEX IF NOT EXISTS monitor_checks_idx
    ON monitor_checks (monitor_id, checked_at DESC)
    INCLUDE (status, latency_ms);

-- ─────────────────────────────────────────────────────────────────────────────
-- monitor_incidents — one row per contiguous stretch of `down`
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monitor_incidents (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id  uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    started_at  timestamptz NOT NULL,
    resolved_at timestamptz,
    cause       text,
    status_code integer
);

CREATE INDEX IF NOT EXISTS monitor_incidents_idx
    ON monitor_incidents (monitor_id, started_at DESC);

-- At most one open incident per monitor, enforced rather than assumed:
-- `open_incident_since` in the UI contract is a single value, so a second open
-- row would make it ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS monitor_incidents_open_idx
    ON monitor_incidents (monitor_id) WHERE resolved_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS monitors_touch_updated_at ON monitors;
CREATE TRIGGER monitors_touch_updated_at
    BEFORE UPDATE ON monitors
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Scheduled jobs
--
-- Both live in pg_cron rather than in the Rust servers, and both are
-- single-execution by construction: no election, no "which server runs it", and
-- no failure mode where the instance that died was the one meant to notice.
--
-- Requires the pg_cron extension (already used for the node cleanup job).
-- ─────────────────────────────────────────────────────────────────────────────

-- Job 1 — record checks for agents that are connected to no server at all.
--
-- Those monitors are never claimed, because a server only claims rows for agents
-- it holds a socket to, so they would otherwise sit overdue in silence. pg_cron
-- cannot see which agents are connected — that lives in server memory — so it
-- infers it from staleness: a row still unclaimed well past its due time proves
-- no server holds its agent, because one that did would have claimed it within a
-- tick.
--
-- The three-minute grace must stay comfortably above MONITOR_TICK_SECS (60).
-- Set it near the tick and this starts taking rows a busy server was about to
-- claim, inventing gaps that never happened; SKIP LOCKED prevents two writers,
-- not misattribution.
SELECT cron.schedule('uptime-offline-sweep', '*/2 * * * *', $job$
WITH stale AS (
    SELECT id, interval_secs, agent_offline_is_outage
    FROM monitors
    WHERE NOT paused
      AND next_check_at < now() - interval '3 minutes'
    ORDER BY next_check_at
    LIMIT 500
    FOR UPDATE SKIP LOCKED
), written AS (
    INSERT INTO monitor_checks
        (monitor_id, checked_at, status, latency_ms, status_code, error)
    SELECT id, now(),
           CASE WHEN agent_offline_is_outage THEN 'down' ELSE 'unknown' END,
           NULL, NULL, 'Agent was not connected'
    FROM stale
    RETURNING monitor_id
)
UPDATE monitors m
-- now() + interval, never next_check_at + interval. Advancing from the stale
-- value moves the row forward one interval while it is still hours in the past,
-- so it is immediately stale again and this job crawls one slot per run: an
-- agent down three days on a 5-minute monitor is 864 slots at one every two
-- minutes, and it never catches up.
SET next_check_at   = now() + make_interval(secs => m.interval_secs),
    last_status     = CASE WHEN m.agent_offline_is_outage THEN 'down' ELSE 'unknown' END,
    last_checked_at = now(),
    last_latency_ms = NULL,
    last_error      = 'Agent was not connected',
    leased_by       = NULL
FROM stale s
WHERE m.id = s.id;
$job$);

-- Job 2 — prune raw checks beyond the 30-day window the dashboard draws.
--
-- There is deliberately no rollup table: 30 days of raw rows is enough to
-- compute the daily strip with a GROUP BY on read, which is one fewer table and
-- one fewer job. Odd minute so this does not land on top of anything else.
SELECT cron.schedule('uptime-prune-checks', '17 3 * * *', $job$
DELETE FROM monitor_checks
WHERE checked_at < now() - interval '30 days';
$job$);


-- ─────────────────────────────────────────────────────────────────────────────
-- Added after the initial schema; safe to re-run.
--
-- `unknown` is too coarse on its own: it covers an agent that timed out, one
-- that disconnected mid-probe, one that shed the check at its capacity cap, and
-- a kind this build cannot run. The free-text `error` distinguishes them to a
-- human but not to code, which is what a filter or a coloured strip needs.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE monitors       ADD COLUMN IF NOT EXISTS last_reason text;
ALTER TABLE monitor_checks ADD COLUMN IF NOT EXISTS reason      text;


-- ─────────────────────────────────────────────────────────────────────────────
-- Added after the initial schema; safe to re-run.
--
-- Retention floor, required by the `ssl` kind.
--
-- The flat 30-day prune above assumes short intervals, and that held while
-- `http` was the only creatable kind: a 900s monitor writes ~96 checks a day, so
-- 30 days is thousands of rows and the window is generous. A daily `ssl` monitor
-- writes one. The same window keeps 30 — fewer than the 200 the detail dialog
-- asks for, so its latency chart and recent-checks table would stay permanently
-- sparse from the monitor's second month onward.
--
-- The floor keeps the most recent 200 rows per monitor regardless of age, and
-- only then applies the 30-day cutoff.
--
-- The LATERAL rides `monitor_checks_idx (monitor_id, checked_at DESC)`, so it
-- reads 201 index entries per monitor rather than ranking the whole table.
-- `OFFSET 200 LIMIT 1` returns no row for a monitor with 200 checks or fewer,
-- and the join then excludes that monitor from the delete entirely — which is
-- exactly the "young or slow monitor" case the floor exists to protect.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    PERFORM cron.unschedule('uptime-prune-checks');
EXCEPTION WHEN OTHERS THEN
    -- Not yet scheduled: a first-time apply must not fail here.
    NULL;
END $$;

SELECT cron.schedule('uptime-prune-checks', '17 3 * * *', $job$
DELETE FROM monitor_checks c
USING monitors m,
LATERAL (
    SELECT k.checked_at
    FROM monitor_checks k
    WHERE k.monitor_id = m.id
    ORDER BY k.checked_at DESC
    OFFSET 200 LIMIT 1
) floor
WHERE c.monitor_id = m.id
  AND c.checked_at < now() - interval '30 days'
  AND c.checked_at < floor.checked_at;
$job$);
