import type { Migration } from './types';

/**
 * Two columns that turn a share from a convenience into a security control.
 *
 * `005-node-shares` shipped node-level, all-or-nothing, forever. Both halves of
 * that were deliberate — the shape was proved first — and both are what stopped
 * anyone using it for the case it was built for. Lending somebody the Grafana
 * that runs on a machine meant lending them a shell on it, and lending it for an
 * afternoon meant remembering to take it back.
 *
 * **services** holds ServiceKind variant names, matching how ServiceKind already
 * serialises on the wire (see common/src/protocol/settings.rs). Empty is not the
 * same as naming nothing: it means "every service this node exposes", including
 * ones added later. An explicit list excludes what is added later, which is why
 * the dialog writes an explicit list and empty only ever arrives from a share
 * made before this migration, or from someone who asked for everything.
 *
 * A name a reader does not recognise is dropped rather than refused, the same
 * degradation Settings::prune_unknown already applies: the share loses one
 * service, not all of them. That is what lets a newer dashboard write a kind an
 * older server has never heard of without silently handing over a shell.
 *
 * **expires_at** is NULL for no expiry. It is checked in the same predicate as
 * revoked_at, everywhere, so an expired share stops the next read exactly as a
 * withdrawn one does; ending a session already open is the server's sweep
 * (server/src/tasks.rs), which treats both the same way for the same reason.
 *
 * Why expiry is not folded into the two live-share unique indexes: a partial
 * index predicate must be immutable and now() is not, so the indexes still see
 * an expired row as live. The write path handles that by reviving rather than
 * inserting - ON CONFLICT DO UPDATE in createShare - which is also what makes
 * "share again, for another week" the same row rather than a second grant.
 *
 * Both columns are additive and backfill themselves: every existing row becomes
 * "every service, no expiry", which is exactly what it granted the day before.
 */
export const shareScope: Migration = {
    id: '006-share-scope',
    description: 'node_shares.services + expires_at: lend one service, for a while',
    sql: `
ALTER TABLE node_shares
    ADD COLUMN IF NOT EXISTS services text[] NOT NULL DEFAULT '{}';

ALTER TABLE node_shares
    ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- The sweep's index: "which live shares have run out". Ordered by the column it
-- is scanned on, and partial on the same predicate the reads use, so it stays
-- the size of the live set rather than of the audit trail.
CREATE INDEX IF NOT EXISTS node_shares_expiry_idx
    ON node_shares (expires_at)
    WHERE revoked_at IS NULL AND expires_at IS NOT NULL;
`,
};
