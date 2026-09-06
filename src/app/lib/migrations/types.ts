/**
 * One schema change, as the app carries it.
 *
 * There is no migration runner package here and no `.sql` files to apply by
 * hand any more: the application owns its schema and brings the database up to
 * it at startup (`src/app/lib/migrate.ts`, called from `src/instrumentation.ts`).
 *
 * **Every migration must be re-runnable.** It is executed on every boot, not
 * once — `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, and backfills guarded on the
 * column still being NULL. That is what makes a database restored from an old
 * dump, or one that missed a deploy, repair itself by being started against
 * rather than by somebody remembering to run something.
 *
 * The SQL is a string in a TypeScript module rather than a file read at
 * runtime, deliberately: the standalone build only ships what it can trace
 * through imports, so a `.sql` read from disk is a file that exists in
 * development and is missing in the container. A module cannot fail to ship.
 *
 * The consequence to work around: a template literal cannot contain a backtick,
 * so SQL comments here use plain identifiers. The prose that wants formatting
 * belongs in the doc comment above the SQL, where backticks are free.
 */
export interface Migration {
    /**
     * Stable and never reused. Recorded in `schema_migrations`, so renaming one
     * makes it look like a new migration that has never run.
     */
    id: string;

    /** One line, for the boot log. */
    description: string;

    /**
     * Applied inside a single transaction, under an advisory lock. Postgres DDL
     * is transactional, so a failure part-way leaves nothing behind.
     */
    sql: string;
}
