/**
 * Startup work, run once per server instance before the first request.
 *
 * Today that is exactly one thing: bringing the database up to the schema this
 * build expects. There is no migration tool in this repo and nothing to apply by
 * hand — the app owns its schema, and starting it against a database is what
 * migrates it. See `src/app/lib/migrate.ts`.
 *
 * `register` is awaited before the server accepts traffic, so a request can
 * never arrive before the tables it needs exist. It is bounded rather than
 * unbounded for the same reason: a database that is not coming back must not
 * hold the container off its port forever, so the bootstrap gives up, logs, and
 * lets the app start.
 *
 * The Edge runtime has no `pg` and no filesystem, so the guard below is not
 * belt-and-braces — this module is evaluated in both runtimes and the import
 * would fail in one of them. It is dynamic for the same reason.
 */
export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }

    const { bootstrapSchema } = await import('@/app/lib/migrate');
    await bootstrapSchema();
}
