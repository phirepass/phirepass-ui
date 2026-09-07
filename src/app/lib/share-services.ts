/**
 * Which services a share opens — the names, and the rule for reading them.
 *
 * Its own module, with **no imports at all**, for the same reason `scope.ts` is
 * split out of `authz.ts`: this is a pure rule that has to be testable without a
 * database, a request or a path alias, and a mistake in it is silent. A union
 * written as an intersection still runs, still returns a set, and quietly hides
 * services somebody was given.
 *
 * The whole file is a copy of `ServiceSet` in
 * `phirepass-rs/server/src/access.rs`, and the duplication is the point: the
 * dashboard decides what to *offer* and the server decides what to *allow*. The
 * two disagreeing is a picker that opens a session the next frame refuses, or
 * hides one that would have worked. `route.test.ts` names its cases after the
 * Rust tests so a drift is visible in both places.
 */

/**
 * The services a share may name, as `ServiceKind` variant names.
 *
 * Uppercase because that is how `ServiceKind` serialises on the wire and how the
 * kind already arrives inside a node's `settings.services` — the same string in
 * the share row, the node record and the Rust enum, so nothing has to translate
 * between three spellings of "ssh".
 *
 * This list is allowed to be *behind* the server's: a name a build does not know
 * is dropped by whoever reads it rather than refused, so a share written by a
 * newer dashboard loses one service on an older reader instead of everything.
 */
export const SHAREABLE_SERVICES = ['SSH', 'SFTP', 'HTTP', 'RDP'] as const;

export type ShareableService = (typeof SHAREABLE_SERVICES)[number];

/**
 * Which service kinds a set of live `node_shares` rows opens, or `null` for
 * "every one".
 *
 * `null` means no narrowing, and it is returned for three distinct reasons that
 * all mean the same thing to a caller: there is no live share at all (an
 * unclaimed node the session owns, which is not a share), a share carries an
 * empty `services` array, or any one of several shares does.
 *
 * Two rules, both from the Rust side:
 *
 * - **An empty array means every service**, including ones added to the node
 *   after the share was made. It is not the same as naming none — those are
 *   opposite meanings, which is why this returns `null` rather than an empty
 *   set for the first and an empty set for the second.
 * - **Shares union, never intersect.** An organisation-wide share and one naming
 *   this person can both be live, and being named in a second must never take
 *   away what the first gave.
 */
export function unionShareServices(
    rows: readonly { services: string[] | null }[],
): ReadonlySet<ShareableService> | null {
    if (rows.length === 0) {
        return null;
    }

    const kinds = new Set<ShareableService>();

    for (const row of rows) {
        const services = row.services ?? [];

        // One wide share widens the whole answer. That is what makes this a
        // union rather than an intersection, and it is the arm that would be
        // silently wrong if it were written the other way round.
        if (services.length === 0) {
            return null;
        }

        for (const name of services) {
            const kind = name.trim().toUpperCase() as ShareableService;
            // Dropped, not refused, exactly as the server reads it: a share
            // naming one unrecognised service loses that service, not all of
            // them. A share naming *only* unrecognised services therefore
            // permits nothing — the safe reading of a permission that cannot be
            // parsed, and distinctly not `null`.
            if ((SHAREABLE_SERVICES as readonly string[]).includes(kind)) {
                kinds.add(kind);
            }
        }
    }

    return kinds;
}
