import type { Migration } from './types';

/**
 * Sharing a node with people you already work with.
 *
 * The access model before this was two-valued: a node answers to its owner, and
 * to whoever reaches the whole organisation (owner and admin, via
 * nodes:read:all). A plain member could see only their own machines, which made
 * "let this person use that box" impossible to say without promoting them to
 * admin and handing them the entire fleet.
 *
 * A share is that third arm, and it has exactly two audiences:
 *
 * - **org** — every member of the organisation the node belongs to.
 * - **member** — one named person in it.
 *
 * There is deliberately no third. A share cannot reach outside the
 * organisation: the row carries org_id, the predicate that reads it
 * (buildScope in src/app/lib/scope.ts) requires the reader's own organisation to
 * match, and the write path refuses a grantee who is not an active member. Three
 * independent checks, because a sharing feature that can leak across a tenant
 * boundary is worse than no sharing feature.
 *
 * What a share does NOT grant is configuration. Reading is nodeScope; renaming,
 * deleting and editing services are nodeManageScope, and the share arm is only
 * added to the first. That is the rule SHARING.md sets out, and it is load
 * bearing for a second reason: service credentials still sit in plaintext in
 * nodes.settings, so a path that hands a grantee the settings back hands them
 * the passwords.
 *
 * Revocation is revoked_at rather than DELETE. Who could reach a machine, and
 * when, is the question this feature exists to answer.
 */
export const nodeShares: Migration = {
    id: '005-node-shares',
    description: 'node_shares: reaching a colleague machine without owning the fleet',
    sql: `
-- ─────────────────────────────────────────────────────────────────────────────
-- node_shares — the third arm of the access predicate
-- ─────────────────────────────────────────────────────────────────────────────
--
-- org_id is denormalised from the node on purpose. It is what lets the read
-- predicate scope a share to the reader organisation in the same index lookup
-- that finds it, without joining back to nodes; and it is what makes a share
-- that outlived a node moving between organisations inert rather than
-- dangerous, because the reader org will no longer match.
CREATE TABLE IF NOT EXISTS node_shares (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    node_id     uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- org: everyone in org_id. member: the one named in grantee_id.
    audience    text NOT NULL CHECK (audience IN ('org', 'member')),
    grantee_id  uuid REFERENCES users(id) ON DELETE CASCADE,

    granted_by  uuid REFERENCES users(id) ON DELETE SET NULL,

    created_at  timestamptz NOT NULL DEFAULT now(),
    revoked_at  timestamptz,

    -- The two audiences are different shapes, and the database says so rather
    -- than trusting every writer to remember.
    CONSTRAINT node_shares_audience_shape CHECK (
        (audience = 'org' AND grantee_id IS NULL)
        OR (audience = 'member' AND grantee_id IS NOT NULL)
    )
);

-- One live org-wide share per node. Sharing with everybody twice is not a
-- second grant, it is the same grant.
CREATE UNIQUE INDEX IF NOT EXISTS node_shares_org_live_idx
    ON node_shares (node_id)
    WHERE audience = 'org' AND revoked_at IS NULL;

-- One live share per (node, person), for the same reason: two rows would make
-- "what may this person do here" ambiguous and force the resolver to invent a
-- precedence rule.
CREATE UNIQUE INDEX IF NOT EXISTS node_shares_member_live_idx
    ON node_shares (node_id, grantee_id)
    WHERE audience = 'member' AND revoked_at IS NULL;

-- The read path: "is this node shared with me, or with my whole organisation".
-- Every node list, count and detail query runs this, so it is the one index
-- that has to exist.
CREATE INDEX IF NOT EXISTS node_shares_lookup_idx
    ON node_shares (node_id, org_id)
    WHERE revoked_at IS NULL;

-- The other direction: "which nodes am I reaching by grant" — the Shared with
-- me filter, and the sweep a future revocation of live sessions will need.
CREATE INDEX IF NOT EXISTS node_shares_grantee_idx
    ON node_shares (grantee_id)
    WHERE audience = 'member' AND revoked_at IS NULL;
`,
};
