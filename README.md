# Phirepass UI

Next.js (App Router) dashboard for Phirepass.

**URL**: https://www.phirepass.com/

```bash
bun run dev     # next dev -p 8084
npm run build   # next build
npm run lint    # eslint .
```

## Design system

All colour lives in CSS custom properties in `src/index.css`; components
reference semantic Tailwind tokens (`accent`, `success`, `warning`, `info`,
`violet`, `destructive`, …), never raw hex values. `--accent` is the dominant
brand colour and carries healthy/online/success signals; `--primary` is the
near-white used for default buttons and hover borders.

Adding a colour means adding a token, not a hex literal.

## Monitoring

`/dashboard/monitor` is shipped and reachable in production. `Servers` and
`Users` remain dev-gated behind `IS_DEV_MODE` (`src/lib/dev-mode.ts`) until RBAC
can restrict them to the roles that should see them — see `src/lib/rbac.ts`.

The page component lives in `src/components/monitor/`, **not** `src/pages/` —
that directory is still an active Pages Router root, so a file there would also
be served at `/Uptime`, as a second uncontrolled entry point.

### Every check runs from an agent

This dashboard does not probe anything. A monitor names one of the user's own
nodes, and the check runs *there*, on that machine's own network — which is the
whole point, because the services people want to watch are usually unreachable
from anywhere else. A target on a private range, or a name that only resolves
inside a VPC, is the normal case rather than the exception.

That also means there is no SSRF surface here: nothing in this process ever
connects to a monitor's target.

The full design, including the scheduling and locking rules, is in
`phirepass-rs/MONITOR.md`.

| Kind | Probe | Creatable |
|---|---|---|
| `http` | Request the URL from the agent; check status code against an expected set, optional keyword present/absent, and response time | yes |
| `ssl` | Certificate issuer, subject and days to expiry | no — `MONITOR_KIND_ENABLED` gates it |
| `domain` | Registrar and registration expiry over RDAP | no — same gate |

Status is five-valued: `up`, `degraded` (slow, or an expiry inside the warning
window), `down`, `unknown` (the probe reached no verdict — an offline agent says
nothing about the target), and `paused`, which the UI derives rather than
stores. **`unknown` is excluded from uptime denominators** and never opens or
resolves an incident.

Monitors have a five-minute minimum interval (`MIN_INTERVAL_SECS`), enforced both
in the form and by a `CHECK` constraint, because the scheduler polls once a
minute and cannot honour anything shorter.

### Storage and scheduling

Tables are `monitors`, `monitor_checks`, `monitor_incidents` — see
`docs/uptime-schema.sql`, which is applied by hand:

```bash
psql "$DATABASE_URL" -f docs/uptime-schema.sql
```

There is no migration runner in this repo yet; that file is the schema of record
and is written to be re-runnable.

Scheduling belongs to the Rust servers, not to this process. Each server polls
Postgres once a minute for monitors that are due **and** belong to an agent it
currently holds a WebSocket to, claiming them with `FOR UPDATE SKIP LOCKED` in
the same statement that pushes `next_check_at` forward — so two servers can never
take the same monitor, with no lock and no coordinator.

Two `pg_cron` jobs finish the picture, both defined in the same SQL file:
`uptime-offline-sweep` records a check for monitors whose agent is connected to
no server at all, and `uptime-prune-checks` drops raw checks past 30 days.

The 30-day strip is aggregated on read (`src/app/lib/monitor.ts`) rather than
from a rollup table — six monitors on a page is ~52k rows grouped per render,
and that cost is bounded by what is on screen rather than by how many monitors
exist.

### Known trade-off

Monitor targets are validated for shape but not for destination, and that is
deliberate: this product exists to reach private infrastructure, so refusing
RFC1918 addresses would rule out the main thing people want to watch. The probe
runs on the user's own agent, against their own network, so the reach it has is
reach they already had.

## Notes

`src/pages/*` is leftover from a pre-Next.js version of the app and is still an
active Pages Router root. Do not add new routes there.
