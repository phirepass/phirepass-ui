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
 * Node sharing (`phirepass-rs/SHARING.md`, roadmap A3) is one more `OR` in the
 * second clause, and adding it there gives it to every list, count and detail
 * route at once. That is the reason nothing writes its own predicate.
 *
 * The boolean is cast explicitly. Left bare, `pg` sends it untyped and Postgres
 * infers it from the `OR` — which works until the fragment is composed into a
 * position where it cannot, and the failure is then a runtime type error in one
 * route rather than something a test would catch.
 */
export function buildScope(shape: ScopeShape, alias: string, style: ScopeStyle): Scope {
    const a = alias ? `${alias}.` : '';

    if (style.style === 'appended') {
        const org = style.used + 1;
        const all = style.used + 2;

        return {
            sql: `((${a}org_id = $${org} OR (${a}org_id IS NULL AND ${a}user_id = $1))
               AND ($${all}::boolean OR ${a}user_id = $1))`,
            params: [shape.orgId, shape.readsAll],
        };
    }

    return {
        sql: `((${a}org_id = $1 OR (${a}org_id IS NULL AND ${a}user_id = $3))
               AND ($2::boolean OR ${a}user_id = $3))`,
        params: [shape.orgId, shape.readsAll, shape.userId],
    };
}

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
