import type { Migration } from './types';

/**
 * Organisations, members and invitations — the object access hangs off.
 *
 * Before this, access was one scalar: `nodes.user_id == jwt.sub`, evaluated
 * independently in five places in this repo and four in `phirepass-rs`. Every
 * account was an island, which is why there was no seat to price, no party to
 * share a node with, and no authority an audit log could belong to.
 *
 * After it, an **organisation owns resources** and a **user holds a role in
 * it**. A node still records which member enrolled it — `nodes.user_id` is
 * untouched and still means "whose it is" — but the boundary that decides who
 * may reach it is `org_id`.
 *
 * Three tables and four columns:
 *
 * | | |
 * |---|---|
 * | `organizations` | the workspace |
 * | `organization_members` | who is in it, and as what |
 * | `organization_invitations` | somebody asked in who has not signed in yet |
 * | `nodes.org_id` `pat_tokens.org_id` `monitors.org_id` | what it owns |
 * | `users.primary_org_id` | which one a session opens in |
 *
 * **`org_id` is nullable, and stays that way.** A NOT NULL here would mean an
 * older `phirepass-rs` build — one that enrols a node without knowing about
 * organisations — failing every enrolment the moment this runs. Both
 * applications read a NULL as "owned by whoever is in `user_id`", which is
 * exactly the behaviour that existed before, so a row the backfill has not
 * reached is visible to its owner and to nobody else. Tightening it is a
 * separate migration to add once every deployment is past this one; see
 * `phirepass-rs/MIGRATION.md`.
 *
 * Re-runnable throughout, backfill included: `IF NOT EXISTS`, `ON CONFLICT DO
 * NOTHING`, and every resource update guarded on `org_id IS NULL`. It executes
 * on every boot, and on the second one it reports zeroes.
 */
export const organizations: Migration = {
    id: '001-organizations',
    description: 'organisations, members, invitations, and one personal org per account',
    sql: `
-- ─────────────────────────────────────────────────────────────────────────────
-- organizations — the workspace that owns nodes, tokens and monitors
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every account has one from the moment it signs in: the backfill below, and
-- ensurePersonalOrg in src/app/lib/authz.ts, both guarantee it. A
-- single-person account is therefore not a special case anywhere in the code —
-- it is an organisation with one owner in it, which is what keeps the access
-- check identical for a hobbyist and for a fifty-seat customer.
CREATE TABLE IF NOT EXISTS organizations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    name        text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),

    -- Stable, URL-safe, and unique. Nothing routes on it yet; it exists now
    -- because retrofitting a unique human-readable key onto rows customers
    -- already hold is the expensive kind of change, and C2's tunnel slugs will
    -- want it.
    slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),

    -- True for the org created automatically around a single account, false for
    -- one somebody deliberately made. The difference is presentational — a
    -- personal org shows the person's own name rather than a workspace switcher
    -- — and it is recorded rather than inferred so that renaming a personal org
    -- does not silently turn it into a team one.
    personal    boolean NOT NULL DEFAULT true,

    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- organization_members — who is in an organisation, and as what
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The role names match src/lib/rbac.ts exactly, and the CHECK constraint is
-- what keeps them matching: a role the UI does not know cannot be written, so
-- can() never has to answer for a value outside its own table.
CREATE TABLE IF NOT EXISTS organization_members (
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    role        text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),

    -- 'suspended' is access removed without the row going away: the person
    -- keeps their nodes, tokens and monitors, and reinstating them is one
    -- UPDATE rather than an invitation and a reassignment. A suspended member
    -- fails requireSession, so it closes the API and not merely the buttons.
    status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended')),

    invited_by  uuid REFERENCES users(id) ON DELETE SET NULL,
    joined_at   timestamptz NOT NULL DEFAULT now(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    -- One membership per (org, user). A second would make "what can Bob do
    -- here" ambiguous and force the resolver to define precedence.
    PRIMARY KEY (org_id, user_id)
);

-- The hot path: every authenticated request resolves the caller's membership
-- from their user id, so this index is on the user rather than the org.
CREATE INDEX IF NOT EXISTS organization_members_user_idx
    ON organization_members (user_id);

-- "Is there still an owner?" is asked before every demotion, removal and
-- suspension. Partial, because the answer only ever concerns owners.
CREATE INDEX IF NOT EXISTS organization_members_owner_idx
    ON organization_members (org_id) WHERE role = 'owner';

-- ─────────────────────────────────────────────────────────────────────────────
-- organization_invitations — asked in, not yet arrived
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sign-in is OAuth, so the person being invited usually has no row in users
-- yet and there is nothing to hang a membership on. The invitation is keyed on
-- the email address instead, and the OAuth callback claims it the first time
-- that address signs in (claimInvitations in src/app/lib/org.ts).
--
-- The email is stored lowercased — the application lowercases before writing
-- and the CHECK enforces it, so the unique index below is a genuine "one live
-- invitation per address per org" rather than one per casing of it.
CREATE TABLE IF NOT EXISTS organization_invitations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    email       text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 320),

    -- An invitation cannot mint an owner. Ownership is transferred deliberately
    -- from an existing owner (PATCH /api/org/members/[userId]), never handed
    -- to an address that has not signed in yet.
    role        text NOT NULL CHECK (role IN ('admin', 'member')),

    -- SHA-256 of the single-use token in the invitation link. Hashed rather than
    -- stored, for the same reason the recovery codes in user_mfa are: the link
    -- is a credential, and a database dump should not be a set of live ones.
    -- NULL is allowed for an invitation that is claimed purely by signing in
    -- with the invited address, which is the ordinary path here.
    token_hash  text CHECK (token_hash IS NULL OR length(token_hash) = 64),

    invited_by  uuid REFERENCES users(id) ON DELETE SET NULL,

    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL DEFAULT now() + interval '14 days',

    accepted_at timestamptz,
    accepted_by uuid REFERENCES users(id) ON DELETE SET NULL,
    revoked_at  timestamptz
);

-- One live invitation per address per organisation. Expiry is deliberately not
-- part of the predicate: an expired invitation still blocks a duplicate, and
-- re-inviting the same address is a resend (which extends expires_at) rather
-- than a second row.
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_live_idx
    ON organization_invitations (org_id, email)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- The claim path at sign-in: "does this address have anything waiting?"
CREATE INDEX IF NOT EXISTS organization_invitations_email_idx
    ON organization_invitations (email)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- The other claim path: somebody opened the link in the mail (/invite/[token],
-- acceptInvitation in src/app/lib/org.ts). Unfiltered, unlike the index above,
-- because that lookup deliberately finds revoked, expired and already-accepted
-- rows too — it has a different thing to say about each of them, and a link
-- that lands on "nothing here" would be the same dead end this route replaced.
CREATE INDEX IF NOT EXISTS organization_invitations_token_idx
    ON organization_invitations (token_hash);

-- ─────────────────────────────────────────────────────────────────────────────
-- The owning column on the three resource tables
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Nullable, and it stays nullable through this migration on purpose. A NOT NULL
-- here would mean an older phirepass-rs build — one that enrols a node without
-- knowing about organisations — fails every enrolment the moment this file is
-- applied. Both applications treat a NULL org_id as "owned by whoever is in
-- user_id", which is exactly the behaviour that existed before this file, so a
-- row the backfill has not reached is visible to its owner and to nobody else.
--
-- Tightening it to NOT NULL is a separate entry in phirepass-rs/MIGRATION.md,
-- to be applied once both applications are deployed and the backfill below has
-- run clean.
ALTER TABLE nodes      ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE pat_tokens ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- monitors is created by 002-uptime, which runs after this one, so on a first
-- boot it does not exist yet. DO block rather than a bare ALTER so this runs to
-- completion either way; 002-uptime creates the column itself for that case.
DO $$
BEGIN
    IF to_regclass('public.monitors') IS NOT NULL THEN
        ALTER TABLE monitors ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
        CREATE INDEX IF NOT EXISTS monitors_org_idx ON monitors (org_id);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS nodes_org_idx      ON nodes (org_id);
CREATE INDEX IF NOT EXISTS pat_tokens_org_idx ON pat_tokens (org_id);

-- nodes.user_id had no index of its own, and the member-scoped node list asks
-- for exactly this pair. Also what makes "how many nodes does this member hold"
-- — shown before every removal — a lookup rather than a scan.
CREATE INDEX IF NOT EXISTS nodes_org_user_idx      ON nodes (org_id, user_id);
CREATE INDEX IF NOT EXISTS pat_tokens_org_user_idx ON pat_tokens (org_id, user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Which organisation a session lands in
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A user can be a member of several organisations; primary_org_id is the one
-- their session opens in. It is a column on users rather than a claim in the
-- JWT so that changing it — being removed from an org, or switching workspace —
-- takes effect on the next request instead of on the next sign-in.
--
-- NULL means "not resolved yet", and ensurePersonalOrg fills it in. It is
-- deliberately not NOT NULL: users rows are created by the OAuth callback
-- before any organisation exists for them.
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill — one personal organisation per existing account
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Written as one function so the whole thing is a single statement to run and a
-- single thing to reason about, and so the slug collision loop has somewhere to
-- live. Re-runnable: every step skips accounts that already have a membership,
-- and the resource updates are guarded on org_id IS NULL, so a second run
-- reports zero rows touched.
--
-- Dropped again at the end. It is a migration step, not an API — leaving it
-- behind would invite it being called from application code, where
-- ensurePersonalOrg is the supported path.
CREATE OR REPLACE FUNCTION pg_temp.phirepass_backfill_orgs()
RETURNS TABLE (orgs_created bigint, nodes_claimed bigint, tokens_claimed bigint, monitors_claimed bigint)
LANGUAGE plpgsql AS $$
DECLARE
    account       record;
    new_org_id    uuid;
    candidate     text;
    base_slug     text;
    suffix        int;
    created       bigint := 0;
    claimed_nodes bigint := 0;
    claimed_pats  bigint := 0;
    claimed_mons  bigint := 0;
    touched       bigint;
BEGIN
    -- Only accounts that are in no organisation at all. An account already
    -- placed in one — by a previous run, or by having been invited into a team
    -- before this ran — is left exactly as it is.
    FOR account IN
        SELECT u.id, u.username, u.email
        FROM users u
        WHERE NOT EXISTS (
            SELECT 1 FROM organization_members m WHERE m.user_id = u.id
        )
        ORDER BY u.id
    LOOP
        -- Slug from the username, falling back to the local part of the email
        -- and then to the id, so an account with an unusable username still
        -- gets a readable one rather than failing the CHECK.
        base_slug := lower(regexp_replace(coalesce(nullif(trim(account.username), ''), split_part(account.email, '@', 1)), '[^a-z0-9]+', '-', 'gi'));
        base_slug := trim(both '-' from base_slug);
        base_slug := left(base_slug, 55);

        IF base_slug !~ '^[a-z0-9]' THEN
            base_slug := 'org-' || left(replace(account.id::text, '-', ''), 12);
        END IF;

        candidate := base_slug;
        suffix := 1;
        WHILE EXISTS (SELECT 1 FROM organizations o WHERE o.slug = candidate) LOOP
            suffix := suffix + 1;
            candidate := left(base_slug, 55) || '-' || suffix::text;
        END LOOP;

        INSERT INTO organizations (name, slug, personal)
        VALUES (
            coalesce(nullif(trim(account.username), ''), split_part(account.email, '@', 1)),
            candidate,
            true
        )
        RETURNING id INTO new_org_id;

        INSERT INTO organization_members (org_id, user_id, role, status)
        VALUES (new_org_id, account.id, 'owner', 'active')
        ON CONFLICT (org_id, user_id) DO NOTHING;

        created := created + 1;
    END LOOP;

    -- Point every account at an organisation it is actually in. Owner first, so
    -- an account that both owns a personal org and was invited into a team lands
    -- in its own rather than somebody else's.
    UPDATE users u
    SET primary_org_id = pick.org_id
    FROM (
        SELECT DISTINCT ON (m.user_id) m.user_id, m.org_id
        FROM organization_members m
        WHERE m.status = 'active'
        ORDER BY m.user_id,
                 (m.role = 'owner') DESC,
                 (m.role = 'admin') DESC,
                 m.joined_at ASC
    ) AS pick
    WHERE u.id = pick.user_id
      AND (u.primary_org_id IS NULL
           OR NOT EXISTS (
               SELECT 1 FROM organization_members m2
               WHERE m2.user_id = u.id AND m2.org_id = u.primary_org_id AND m2.status = 'active'
           ));

    -- Resources follow their owner into that owner's primary organisation.
    -- Guarded on org_id IS NULL so a node already assigned — including one
    -- deliberately moved to a different org — is never reassigned by a re-run.
    UPDATE nodes n
    SET org_id = u.primary_org_id
    FROM users u
    WHERE n.user_id = u.id AND n.org_id IS NULL AND u.primary_org_id IS NOT NULL;
    GET DIAGNOSTICS touched = ROW_COUNT;
    claimed_nodes := touched;

    UPDATE pat_tokens p
    SET org_id = u.primary_org_id
    FROM users u
    WHERE p.user_id = u.id AND p.org_id IS NULL AND u.primary_org_id IS NOT NULL;
    GET DIAGNOSTICS touched = ROW_COUNT;
    claimed_pats := touched;

    IF to_regclass('public.monitors') IS NOT NULL THEN
        EXECUTE $q$
            UPDATE monitors m
            SET org_id = u.primary_org_id
            FROM users u
            WHERE m.user_id = u.id AND m.org_id IS NULL AND u.primary_org_id IS NOT NULL
        $q$;
        GET DIAGNOSTICS touched = ROW_COUNT;
        claimed_mons := touched;
    END IF;

    RETURN QUERY SELECT created, claimed_nodes, claimed_pats, claimed_mons;
END
$$;

SELECT * FROM pg_temp.phirepass_backfill_orgs();

DROP FUNCTION pg_temp.phirepass_backfill_orgs();
`,
};
