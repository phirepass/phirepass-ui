import type { Migration } from './types';

/**
 * `auth_challenges` is keyed on `(node_id, challenge)`, not on `node_id` alone.
 *
 * `phirepass-rs` moved to the wider key in Q04 (commit `fe25b50`), so that a
 * node can hold more than one outstanding challenge: under the old key a second
 * challenge request overwrote the first and failed whichever sign-in was still
 * in flight. Its insert is now `ON CONFLICT (node_id, challenge) DO NOTHING`,
 * and Postgres refuses that statement outright unless a unique key on exactly
 * those columns exists. The change was applied to production by hand, from a
 * SQL file that was never committed, while `000-base` was written from the
 * older schema. So a database created by this app alone answered every agent
 * sign-in with a 500 (`CHALLENGE_WRITE_FAILED`), while production worked.
 *
 * `000-base` now creates the table with the wide key; this repairs a database
 * that `000-base` already created with the narrow one. It decides from the
 * catalogue, so it is safe on every shape it can meet:
 *
 * - a unique key on exactly `(node_id, challenge)` already exists, as a
 *   constraint or a bare unique index (production, a new install): nothing;
 * - the primary key is `node_id` alone: it is replaced. Widening a key cannot
 *   create a duplicate, so no row has to go;
 * - no primary key at all: one is added;
 * - a primary key on anything else: it fails loudly rather than guessing. A
 *   failed migration does not stop the app booting, it is logged and retried.
 *
 * Nothing references `auth_challenges`, so dropping its key touches no
 * foreign key. Rows are short-lived challenges; the table is tiny.
 */
export const authChallengeKey: Migration = {
    id: '008-auth-challenge-key',
    description: 'auth_challenges keyed on (node_id, challenge)',
    sql: `
DO $key$
DECLARE
    tbl regclass := to_regclass('auth_challenges');
    pk_name text;
    pk_cols text[];
BEGIN
    IF tbl IS NULL THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = tbl
          AND i.indisunique
          AND i.indpred IS NULL
          AND i.indexprs IS NULL
          AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
               FROM unnest(i.indkey) AS k(attnum)
               JOIN pg_attribute a ON a.attrelid = tbl AND a.attnum = k.attnum)
              = ARRAY['challenge', 'node_id']
    ) THEN
        RETURN;
    END IF;

    SELECT c.conname,
           (SELECT array_agg(a.attname::text ORDER BY a.attname)
            FROM unnest(c.conkey) AS k(attnum)
            JOIN pg_attribute a ON a.attrelid = tbl AND a.attnum = k.attnum)
    INTO pk_name, pk_cols
    FROM pg_constraint c
    WHERE c.conrelid = tbl AND c.contype = 'p';

    IF pk_name IS NULL THEN
        EXECUTE format('ALTER TABLE %s ADD PRIMARY KEY (node_id, challenge)', tbl);
    ELSIF pk_cols = ARRAY['node_id'] THEN
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', tbl, pk_name);
        EXECUTE format('ALTER TABLE %s ADD PRIMARY KEY (node_id, challenge)', tbl);
    ELSE
        RAISE EXCEPTION 'auth_challenges has an unexpected primary key (%) on %; expected (node_id) or (node_id, challenge)',
            pk_name, pk_cols;
    END IF;
END
$key$;
`,
};
