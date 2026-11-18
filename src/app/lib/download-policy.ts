/**
 * The organisation's download policy for a node (T1.15, Restrictions; L1).
 *
 * A ceiling over the node's switches, set by an owner or admin: `allowed`,
 * `links_only` (no torrents) or `blocked`. The Rust server enforces it
 * (`server/src/fetch/policy.rs`) and stops running downloads it no longer
 * allows within one access sweep. The dashboard's part is writing it and,
 * in the same statement, removing the switches it forbids from
 * `nodes.settings`, so the card and the share dialog stop offering them at
 * once. The agent receives the shortened list on its next connect.
 *
 * One statement rather than BEGIN/COMMIT: `db.ts` shares one client between
 * requests, so a transaction spread over several awaits could take in
 * another request's queries. A data-modifying CTE is atomic on its own.
 *
 * Import-free so `download-policy.db.test.ts` can run it in Postgres.
 */

export const DOWNLOAD_POLICIES = ['allowed', 'links_only', 'blocked'] as const;
export type DownloadPolicy = (typeof DOWNLOAD_POLICIES)[number];

export function parsePolicy(value: unknown): DownloadPolicy | null {
    return typeof value === 'string' && (DOWNLOAD_POLICIES as readonly string[]).includes(value)
        ? (value as DownloadPolicy)
        : null;
}

/** The switches a policy forbids, as stored service kinds. */
export function forbiddenKinds(policy: DownloadPolicy): string[] {
    switch (policy) {
        case 'blocked': return ['FETCH', 'TORRENT'];
        case 'links_only': return ['TORRENT'];
        default: return [];
    }
}

/**
 * Sets the policy on a node of organisation `$2` and strips the forbidden
 * switches. Matches nothing for a node outside that organisation, an
 * unclaimed one included: there is no organisation to restrict it.
 *
 * `$1` node, `$2` organisation, `$3` policy, `$4` who, `$5` kinds to strip.
 * Answers one row: `saved` (0 or 1) and `stripped` (services removed).
 */
export const SET_POLICY_SQL = `
WITH target AS (
    SELECT n.id FROM nodes n WHERE n.id = $1 AND n.org_id = $2
), saved AS (
    INSERT INTO node_download_policy (node_id, policy, changed_by, changed_at)
    SELECT id, $3, $4, now() FROM target
    ON CONFLICT (node_id) DO UPDATE
        SET policy = EXCLUDED.policy, changed_by = EXCLUDED.changed_by, changed_at = EXCLUDED.changed_at
    RETURNING node_id
), before AS (
    SELECT n.id, n.settings->'services' AS services
      FROM nodes n JOIN saved ON saved.node_id = n.id
     WHERE jsonb_typeof(n.settings->'services') = 'array'
), stripped AS (
    UPDATE nodes n
       SET settings = jsonb_set(n.settings, '{services}', COALESCE(
               (SELECT jsonb_agg(s) FROM jsonb_array_elements(before.services) s
                 WHERE NOT (upper(s->>'kind') = ANY($5::text[]))),
               '[]'::jsonb))
      FROM before
     WHERE n.id = before.id
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(before.services) s
                    WHERE upper(s->>'kind') = ANY($5::text[]))
    RETURNING (SELECT count(*) FROM jsonb_array_elements(before.services) s
                WHERE upper(s->>'kind') = ANY($5::text[])) AS removed
)
SELECT (SELECT count(*) FROM saved)::int AS saved,
       COALESCE((SELECT sum(removed) FROM stripped), 0)::int AS stripped`;

/** Downloads that still count as running, as `/api/nodes` counts them. */
const RUNNING_STATES = "('Queued', 'Scheduled', 'Resolving', 'FetchingMetadata', 'Downloading', 'Verifying', 'Paused', 'Retrying', 'Seeding')";

/**
 * Every node of organisation `$1` with its policy and what it is doing (L1).
 * Seeding counts as running here, since a block stops it too.
 */
export const LIST_POLICIES_SQL = `
SELECT n.id, n.name, n.user_id AS owner_id,
       o.username AS owner_username, o.email AS owner_email,
       COALESCE(p.policy, 'allowed') AS policy, p.changed_at,
       p.changed_by, c.username AS changed_by_username, c.email AS changed_by_email,
       EXISTS (SELECT 1 FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(n.settings->'services') = 'array'
                        THEN n.settings->'services' ELSE '[]'::jsonb END) s
                WHERE upper(s->>'kind') = 'FETCH') AS downloads_on,
       (SELECT count(*) FROM downloads d
         WHERE d.node_id = n.id AND d.wanted = 'running'
           AND d.state IN ${RUNNING_STATES})::int AS running
  FROM nodes n
  LEFT JOIN users o ON o.id = n.user_id
  LEFT JOIN node_download_policy p ON p.node_id = n.id
  LEFT JOIN users c ON c.id = p.changed_by
 WHERE n.org_id = $1
 ORDER BY lower(coalesce(n.name, '')), n.id`;
