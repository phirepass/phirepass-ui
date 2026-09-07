/**
 * The org-scoping predicate, as a pure function.
 *
 * Split out of `authz.ts` so it can be tested without a database, a cookie or a
 * request: this is where a mistake is silent — a fragment that numbers its
 * placeholders wrongly still runs, still returns rows, and returns the wrong
 * ones. `scope.test.ts` is about that.
 *
 * `authz.ts` is the only intended caller; it supplies the shape from a resolved
 * session and re-exports the results under names that say what they scope.
 */

/** Everything the predicate needs, with no session type attached. */
export interface ScopeShape {
    orgId: string;
    userId: string;
    /** Whether this session holds the `…:read:all` / `…:manage:all` permission. */
    readsAll: boolean;
}

/**
 * Where the node id lives, for a scope that should also admit shared nodes.
 *
 * Opt-in, and per caller, because the three tables this predicate scopes do not
 * agree on the question. `nodes` is shared through its own `id`; `monitors`
 * through `node_id`, so a monitor watching a machine you were given follows the
 * machine; `pat_tokens` is not shared at all — a token is a credential, and
 * being lent a node is not being lent the owner's credentials.
 *
 * Omitted means "no share arm", which is also what `nodeManageScope` passes:
 * a share grants *use*, and configuration stays with the owner.
 */
export type SharedVia = string | undefined;

export interface Scope {
    sql: string;
    params: unknown[];
}

export type ScopeStyle =
    /**
     * The fragment numbers itself `$1 $2 $3` and supplies all three values. For
     * a query whose parameter list starts here, or one that will push the
     * fragment forward with `renumber`.
     */
    | { style: 'leading' }
    /**
     * The fragment reuses `$1` as the caller's own user id — which the query
     * already passes — and appends its remaining two values after the `used`
     * parameters the caller has.
     *
     * This exists so a query with a dynamic `WHERE` can gain org scoping without
     * every placeholder in it moving. Build your conditions, then append this
     * one; they are ANDed, so the order is free.
     */
    | { style: 'appended'; used: number };

/**
 * Three clauses, and the middle one is the access model:
 *
 * - the row is in the caller's organisation — **or** it is an unclaimed row they
 *   own, which is the rollout tolerance described in
 *   `migrations/001-organizations.ts`; that arm comes out with the NOT NULL
 *   entry in `MIGRATION.md` — **and**
 * - either they may read everything in the organisation, or the row is theirs.
 *
 * Node sharing (`phirepass-rs/SHARING.md`, roadmap A3) is that one more `OR` in
 * the second clause — `shareArm` below — and putting it there gave it to every
 * list, count and detail route at once. That is the reason nothing writes its
 * own predicate.
 *
 * The boolean is cast explicitly. Left bare, `pg` sends it untyped and Postgres
 * infers it from the `OR` — which works until the fragment is composed into a
 * position where it cannot, and the failure is then a runtime type error in one
 * route rather than something a test would catch.
 */
export function buildScope(
    shape: ScopeShape,
    alias: string,
    style: ScopeStyle,
    sharedVia?: SharedVia,
): Scope {
    const a = alias ? `${alias}.` : '';

    if (style.style === 'appended') {
        const org = style.used + 1;
        const all = style.used + 2;

        return {
            sql: `((${a}org_id = $${org} OR (${a}org_id IS NULL AND ${a}user_id = $1))
               AND ($${all}::boolean OR ${a}user_id = $1${shareArm(a, sharedVia, `$${org}`, '$1')}))`,
            params: [shape.orgId, shape.readsAll],
        };
    }

    return {
        sql: `((${a}org_id = $1 OR (${a}org_id IS NULL AND ${a}user_id = $3))
               AND ($2::boolean OR ${a}user_id = $3${shareArm(a, sharedVia, '$1', '$3')}))`,
        params: [shape.orgId, shape.readsAll, shape.userId],
    };
}

/**
 * The share arm: "or somebody gave this node to me, or to everyone here".
 *
 * It sits on the **second** clause, never the first. That placement is the
 * whole safety argument, and it is worth spelling out:
 *
 * - The first clause has already established that the row is in the caller's own
 *   organisation. A share therefore cannot widen *which* organisation is
 *   readable; it can only widen *who inside it* reads a given row.
 * - `org_id` is matched again inside the subquery against the same parameter, so
 *   even a `node_shares` row that somehow named another organisation — a node
 *   moved after being shared, a hand-written row — selects nothing.
 * - `revoked_at IS NULL` is the revocation, and it is evaluated on every read
 *   rather than cached anywhere. `expires_at` is read in the same breath and is
 *   deliberately not a separate concept: a share that ran out and a share that
 *   was withdrawn grant exactly the same thing, which is nothing, and any reader
 *   that checked one without the other would be a reader that honours a share
 *   past the hour it was lent for.
 *
 * What this arm does **not** narrow is the service. `services` scopes which of
 * SSH/SFTP/HTTP/RDP a session may open, and that is a per-message decision the
 * Rust server makes (`server/src/access.rs`); the dashboard's question is only
 * whether the node is visible at all. A share naming one service still lists the
 * machine — it has to, or there would be nothing to open the session from.
 *
 * Adds no parameters: the organisation and the caller are already values this
 * fragment passes, so the arm reuses their placeholders and every existing
 * number in the caller's query stays where it was.
 */
function shareArm(a: string, sharedVia: SharedVia, org: string, me: string): string {
    if (!sharedVia) return '';

    return ` OR EXISTS (
                   SELECT 1 FROM node_shares s
                    WHERE s.node_id = ${a}${sharedVia}
                      AND s.org_id = ${org}
                      AND ${LIVE_SHARE}
                      AND (s.audience = 'org' OR s.grantee_id = ${me}))`;
}

/**
 * What makes a `node_shares` row count, aliased `s`.
 *
 * One string, exported, because it is repeated in `node-share.ts` and in the
 * Rust server's own query, and a copy of it that forgot the expiry check is a
 * share that outlives its own deadline. Anything reading `node_shares` for an
 * access decision uses this; the only readers that do not are the ones showing
 * the audit trail, which want the withdrawn rows precisely because they are
 * withdrawn.
 */
export const LIVE_SHARE =
    "s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now())";

/**
 * Shift every placeholder in a fragment by `offset`, so a leading scope can sit
 * after parameters the caller passes first.
 *
 * `\d+`, not `\d`: a single-digit pattern turns `$1` into `$10` and then reads
 * the trailing zero as part of the next token, which is the kind of bug that
 * only shows up on the query that happens to have ten parameters.
 */
export function renumber(sql: string, offset: number): string {
    return sql.replace(/\$(\d+)/g, (_, digits: string) => `$${Number(digits) + offset}`);
}
