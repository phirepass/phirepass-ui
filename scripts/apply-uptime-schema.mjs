/**
 * Applies docs/uptime-schema.sql, reusing the same connection shape as
 * src/app/lib/db.ts (pg + PGSSLROOTCERT) so TLS is handled exactly as the app
 * does it. Run from the phirepass-ui directory.
 *
 *   node apply-uptime-schema.mjs --check   read-only prerequisites
 *   node apply-uptime-schema.mjs --apply   apply inside a single transaction
 *   node apply-uptime-schema.mjs --cron    scheduled jobs and their run history
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const envPath = path.resolve(process.cwd(), '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
    }
    if (!(match[1] in process.env)) process.env[match[1]] = value;
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

if (mode === '--check') {
    console.log('server:', (await one('SELECT version() AS v')).v.split(',')[0]);
    console.log('current_user:', (await one('SELECT current_user AS u')).u);

    const ext = await one(
        `SELECT
            (SELECT count(*)::int FROM pg_extension WHERE extname = 'pg_cron')          AS installed,
            (SELECT count(*)::int FROM pg_available_extensions WHERE name = 'pg_cron')  AS available`,
    );
    console.log('pg_cron: installed =', ext.installed, '| available =', ext.available);

    const tables = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('users','nodes','monitors','monitor_checks','monitor_incidents')
         ORDER BY table_name`,
    );
    console.log('relevant tables present:', tables.rows.map((r) => r.table_name).join(', ') || '(none)');

    if (ext.installed) {
        const jobs = await client.query(`SELECT jobname FROM cron.job ORDER BY jobname`);
        console.log('existing cron jobs:', jobs.rows.map((r) => r.jobname).join(', ') || '(none)');
    }
} else if (mode === '--cron') {
    // `database` matters as much as `active`: pg_cron runs each job against the
    // database named on the row, so a job scheduled from the wrong connection
    // sits there looking healthy and failing every time it fires.
    const jobs = await client.query(
        `SELECT jobid, jobname, schedule, active, database, username
         FROM cron.job ORDER BY jobname`,
    );
    console.table(jobs.rows);

    const runs = await client.query(
        `SELECT j.jobname, r.status, r.return_message,
                r.start_time, r.end_time
         FROM cron.job_run_details r
         JOIN cron.job j ON j.jobid = r.jobid
         WHERE j.jobname LIKE 'uptime-%'
         ORDER BY r.start_time DESC
         LIMIT 10`,
    );
    if (runs.rows.length === 0) {
        console.log('\nno runs recorded yet for uptime-* jobs');
    } else {
        console.log('\nmost recent uptime job runs:');
        console.table(runs.rows.map((r) => ({
            job: r.jobname,
            status: r.status,
            message: (r.return_message ?? '').slice(0, 60),
            started: r.start_time?.toISOString?.() ?? String(r.start_time),
        })));
    }
} else if (mode === '--apply') {
    const sql = fs.readFileSync(path.resolve(process.cwd(), 'docs/uptime-schema.sql'), 'utf8');
    try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('applied and committed');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('ROLLED BACK — nothing was changed');
        console.error(err.message);
        process.exitCode = 1;
    }
} else {
    console.error(`unknown mode: ${mode}`);
    process.exitCode = 2;
}

await client.end();
