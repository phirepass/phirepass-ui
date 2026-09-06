/**
 * Read-only diagnostics for the organisation schema.
 *
 * **This script does not apply anything.** The app owns its schema and migrates
 * the database at startup (src/app/lib/migrate.ts, called from
 * src/instrumentation.ts), so applying it from here as well would be a second
 * writer racing the first. What is left is the two questions that are worth
 * asking from outside a running app.
 *
 * Reuses the same connection shape as src/app/lib/db.ts (pg + PGSSLROOTCERT) so
 * TLS is handled exactly as the app does it. Run from the phirepass-ui directory.
 *
 *   node scripts/check-org-schema.mjs --check    what is there now
 *   node scripts/check-org-schema.mjs --verify   is anything still unclaimed?
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (!match) continue;
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!(match[1] in process.env)) process.env[match[1]] = value;
    }
}

const resolvePem = (value) => value.includes('-----BEGIN CERTIFICATE-----')
    ? value
    : fs.readFileSync(path.isAbsolute(value) ? value : path.resolve(process.cwd(), value)).toString();

const url = new URL(process.env.DATABASE_URL);
const client = new pg.Client({
    user: url.username,
    password: url.password,
    host: url.hostname,
    port: Number(url.port),
    database: url.pathname.replace(/^\//, ''),
    ssl: process.env.PGSSLROOTCERT
        ? { ca: resolvePem(process.env.PGSSLROOTCERT), rejectUnauthorized: true }
        : { rejectUnauthorized: false },
});

const mode = process.argv[2] ?? '--check';

await client.connect();
console.log(`connected: ${url.hostname}:${url.port}/${url.pathname.replace(/^\//, '')}`);

const one = async (sql, params = []) => (await client.query(sql, params)).rows[0];

/**
 * Both --check and --verify want this, for opposite reasons: before applying it
 * says how much there is to do, after applying it should be all zeroes.
 */
const unclaimed = async () => one(
    `SELECT
        (SELECT count(*)::int FROM users)                                       AS users_total,
        (SELECT count(*)::int FROM users WHERE primary_org_id IS NULL)          AS users_without_org,
        (SELECT count(*)::int FROM nodes WHERE org_id IS NULL)                  AS nodes_without_org,
        (SELECT count(*)::int FROM pat_tokens WHERE org_id IS NULL)             AS tokens_without_org,
        (SELECT CASE WHEN to_regclass('public.monitors') IS NULL THEN -1
                     ELSE (SELECT count(*)::int FROM monitors WHERE org_id IS NULL) END) AS monitors_without_org`,
);

if (mode === '--check') {
    console.log('server:', (await one('SELECT version() AS v')).v.split(',')[0]);
    console.log('current_user:', (await one('SELECT current_user AS u')).u);

    const tables = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('users','nodes','pat_tokens','monitors','schema_migrations',
                              'organizations','organization_members','organization_invitations')
         ORDER BY table_name`,
    );
    console.log('relevant tables present:', tables.rows.map((r) => r.table_name).join(', ') || '(none)');

    const columns = await client.query(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND ((table_name IN ('nodes','pat_tokens','monitors') AND column_name = 'org_id')
             OR (table_name = 'users' AND column_name = 'primary_org_id'))
         ORDER BY table_name`,
    );
    console.log('owning columns present:', columns.rows.map((r) => `${r.table_name}.${r.column_name}`).join(', ') || '(none)');

    // What the app thinks it has done, which is the first thing to compare
    // against the tables above when they disagree.
    const ledger = await client.query(
        `SELECT id, runs, first_applied_at, last_applied_at
         FROM schema_migrations ORDER BY id`,
    ).catch(() => null);
    if (ledger?.rows?.length) {
        console.table(ledger.rows);
    } else {
        console.log('schema_migrations: (absent or empty — the app has not run against this database)');
    }

    // Only meaningful once the columns exist; before that the query itself
    // cannot run, which is answer enough.
    if (columns.rowCount > 0) {
        console.table([await unclaimed()]);
    } else {
        console.log('nothing to count yet — the app has not migrated this database');
    }
} else if (mode === '--apply') {
    console.error('--apply is gone: the app migrates the database when it starts.');
    console.error('Start (or restart) phirepass-ui against this DATABASE_URL instead,');
    console.error('then re-run --verify. See src/app/lib/migrate.ts.');
    process.exitCode = 2;
} else if (mode === '--verify') {
    const counts = await unclaimed();
    console.table([counts]);

    const clean = counts.users_without_org === 0
        && counts.nodes_without_org === 0
        && counts.tokens_without_org === 0
        && counts.monitors_without_org <= 0;

    console.log(clean
        ? 'clean — safe to apply the NOT NULL entry in phirepass-rs/MIGRATION.md'
        : 'NOT clean — restart the app against this database, and do not tighten '
          + 'the columns to NOT NULL yet');
    if (!clean) process.exitCode = 1;
} else {
    console.error(`unknown mode: ${mode}`);
    process.exitCode = 2;
}

await client.end();
