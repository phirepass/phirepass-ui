/**
 * Bringing the database up to the schema this build expects, at startup.
 *
 * There is no migration tool in this repo and nothing to run by hand. The
 * application owns its schema: `src/instrumentation.ts` calls `runMigrations`
 * once per server instance, before the first request is served, and every
 * migration in `./migrations` is applied if it is not already there.
 *
 * Four properties, and each one is a way this otherwise goes wrong:
 *
 * - **Every migration is re-runnable, and runs on every boot.** Not "once, and
 *   then recorded as done" — a database restored from an old dump, or one that
 *   missed a deploy, repairs itself by being started against. The ledger below
 *   exists to say *when* something first appeared, not to decide whether to try.
 *
 * - **One instance at a time.** `docker-compose` scales this container, and
 *   concurrent `CREATE TABLE IF NOT EXISTS` against the same name is a real
 *   error (`duplicate key … pg_type_typname_nsp_index`), not a no-op. A Postgres
 *   advisory lock serialises them; the losers wait, then find everything already
 *   done and finish in milliseconds.
 *
 * - **All or nothing, per migration.** Postgres DDL is transactional, so a
 *   failure part-way leaves the database exactly as it was rather than half
 *   migrated. Each migration gets its own transaction, so one that fails does
 *   not roll back the ones before it.
 *
 * - **A failure does not stop the app booting.** A dashboard that refuses to
 *   start because Postgres had a bad minute is worse than one that starts and
 *   reports errors on the routes that need it — and the next restart, or the
 *   next deploy, tries again. It is logged loudly and `readyz` is left to the
 *   deployment's own judgement.
 */

import { query } from './db';
import { MIGRATIONS, type Migration } from './migrations';

/**
 * The advisory lock every instance contends for.
 *
 * An arbitrary constant, and it only has to be unique among whatever else uses
 * advisory locks on this database — which today is nothing. Session-scoped
 * rather than transaction-scoped, because it is held across several
 * transactions.
 */
const LOCK_KEY = 8_142_339_071;

/** Long enough for another instance to finish; short enough not to hang a deploy. */
const LOCK_TIMEOUT_MS = 60_000;

/** How long to keep trying to reach Postgres at all before giving up on this boot. */
const CONNECT_ATTEMPTS = 5;
const CONNECT_BACKOFF_MS = 2_000;

export interface MigrationOutcome {
    id: string;
    status: 'applied' | 'failed';
    /** Milliseconds the statement took. */
    ms: number;
    error?: string;
}

/**
 * The ledger.
 *
 * Not a gate — the migrations run whether or not they appear here. It answers
 * "when did this database first get organisations", which is the question
 * anybody debugging a half-migrated environment actually has, and it makes a
 * boot log that says "already current" trustworthy.
 *
 * Created **inside** the advisory lock, like everything else.
 * `CREATE TABLE IF NOT EXISTS` is not concurrency-safe: two instances running it
 * at the same moment race on the row type Postgres creates alongside the table,
 * and the loser gets `duplicate key value violates unique constraint
 * "pg_type_typname_nsp_index"`. Five instances started together reproduce it
 * every time. The `IF NOT EXISTS` protects against the table already existing,
 * not against somebody creating it right now.
 */
const LEDGER = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    id               text PRIMARY KEY,
    description      text NOT NULL DEFAULT '',
    first_applied_at timestamptz NOT NULL DEFAULT now(),
    last_applied_at  timestamptz NOT NULL DEFAULT now(),
    runs             integer NOT NULL DEFAULT 1
);
`;

const sleep = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Wait for Postgres to answer.
 *
 * At boot the database is often a container that started at the same time as
 * this one, so the first connection failing is ordinary rather than a fault.
 * Bounded, because a database that is not coming back should not hold the
 * server off its port indefinitely.
 */
async function waitForDatabase(): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
        try {
            await query('SELECT 1');
            return;
        } catch (error) {
            lastError = error;
            if (attempt < CONNECT_ATTEMPTS) {
                console.warn(`[migrate] database not reachable (attempt ${attempt}/${CONNECT_ATTEMPTS}), retrying`);
                await sleep(CONNECT_BACKOFF_MS);
            }
        }
    }

    throw lastError;
}

async function applyOne(migration: Migration): Promise<MigrationOutcome> {
    const started = Date.now();

    try {
        await query('BEGIN');
        await query(migration.sql);
        await query(
            `INSERT INTO schema_migrations (id, description)
             VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE
                SET last_applied_at = now(),
                    runs = schema_migrations.runs + 1,
                    description = EXCLUDED.description`,
            [migration.id, migration.description],
        );
        await query('COMMIT');

        return { id: migration.id, status: 'applied', ms: Date.now() - started };
    } catch (error) {
        // Best-effort: if the connection itself died the rollback fails too, and
        // the transaction is already gone with it.
        await query('ROLLBACK').catch(() => undefined);

        return {
            id: migration.id,
            status: 'failed',
            ms: Date.now() - started,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Apply every migration. Safe to call more than once; only one caller at a time
 * does any work.
 *
 * Returns what happened, so a caller that wants to act on it can — the startup
 * path only logs.
 */
export async function runMigrations(): Promise<MigrationOutcome[]> {
    if (!process.env.DATABASE_URL) {
        console.warn('[migrate] DATABASE_URL is not set — skipping schema bootstrap');
        return [];
    }

    await waitForDatabase();

    // `lock_timeout` bounds the wait rather than the whole statement, so an
    // instance that cannot get the lock gives up and boots instead of hanging.
    // Set on the session and cleared afterwards, because this connection is
    // shared with the rest of the process.
    await query(`SET lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);

    try {
        await query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    } catch (error) {
        await query("SET lock_timeout = '0'").catch(() => undefined);
        // Rethrown rather than wrapped: `Error`'s `cause` option is ES2022 and
        // this project's lib is ES2020, and the context is more useful in the
        // log beside the original error than folded into its message.
        console.error(
            `[migrate] could not take the migration lock within ${LOCK_TIMEOUT_MS}ms — ` +
            'another instance may be stuck holding it',
        );
        throw error;
    }

    try {
        // Inside the lock. See the note on LEDGER: creating it concurrently is
        // the same `pg_type` race every other CREATE TABLE here has.
        await query(LEDGER);

        const outcomes: MigrationOutcome[] = [];

        for (const migration of MIGRATIONS) {
            const outcome = await applyOne(migration);
            outcomes.push(outcome);

            if (outcome.status === 'failed') {
                // Stop at the first failure: a later migration may depend on
                // this one, and applying it against a database that did not get
                // the earlier change is how a half-migrated schema is made.
                console.error(`[migrate] ${migration.id} FAILED after ${outcome.ms}ms: ${outcome.error}`);
                break;
            }

            console.log(`[migrate] ${migration.id} ok (${outcome.ms}ms) — ${migration.description}`);
        }

        return outcomes;
    } finally {
        // The lock is session-scoped and this connection outlives the boot, so
        // failing to release it would block every later deploy.
        await query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch((error) => {
            console.error('[migrate] failed to release the migration lock:', error);
        });
        await query("SET lock_timeout = '0'").catch(() => undefined);
    }
}

/**
 * The startup entry point: run the migrations, and never let a failure stop the
 * process from coming up.
 *
 * Idempotent within a process — Next can call `register()` more than once in
 * development as it recompiles, and the second call should not queue a second
 * bootstrap behind the first.
 */
let inFlight: Promise<void> | null = null;

export function bootstrapSchema(): Promise<void> {
    if (!inFlight) {
        inFlight = (async () => {
            const started = Date.now();

            try {
                const outcomes = await runMigrations();
                const failed = outcomes.filter((outcome) => outcome.status === 'failed');

                if (failed.length > 0) {
                    console.error(
                        `[migrate] schema bootstrap incomplete after ${Date.now() - started}ms — ` +
                        `${failed.length} migration(s) failed. The app is starting anyway; ` +
                        'routes that need the missing schema will error until this is fixed.',
                    );
                } else if (outcomes.length > 0) {
                    console.log(`[migrate] schema current (${outcomes.length} migration(s), ${Date.now() - started}ms)`);
                }
            } catch (error) {
                console.error('[migrate] schema bootstrap could not run:', error);
            }
        })();
    }

    return inFlight;
}

/** Only for tests, which need a fresh process-level guard per case. */
export function resetBootstrapForTests(): void {
    inFlight = null;
}
