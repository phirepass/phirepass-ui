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

## Uptime monitoring (dev preview)

`/dashboard/uptime` is gated to development builds. The gate is enforced in three
places, because a hidden nav item is not access control:

1. `IS_DEV_MODE` (`src/lib/dev-mode.ts`) hides the nav entry.
2. `src/app/dashboard/uptime/page.tsx` calls `notFound()` in production.
3. `requireUptimeAccess()` makes every `/api/uptime/*` route answer 404 in
   production, before authentication is even considered.

The page component lives in `src/components/uptime/`, **not** `src/pages/` —
that directory is still an active Pages Router root, so a file there would also
be served at `/Uptime`, outside the gate.

### What it checks

| Kind | Probe | Reports |
|---|---|---|
| `http` | `fetch` with timeout, optional redirect following | Status code against an expected set, optional keyword present/absent, response time |
| `tcp` | Raw socket connect | Handshake time |
| `ssl` | `tls.connect` with verification **deliberately off** | Issuer, subject, days to expiry, and what a strict client would have concluded (`socket.authorized`) |
| `domain` | RDAP via `rdap.org` | Registrar, registration expiry |

Status is four-valued: `up`, `degraded` (slow, or an expiry inside the warning
window), `down`, and `unknown` (the probe could not form an opinion — an RDAP
registry being unreachable says nothing about the domain). `unknown` is excluded
from uptime denominators and never opens or resolves an incident.

### Storage and scheduling

Tables are `uptime_monitors`, `uptime_checks`, `uptime_incidents` — see
`docs/uptime-schema.sql`. While the feature is dev-gated, `ensureUptimeSchema()`
applies that DDL lazily on first use; **promoting the feature to production means
applying the SQL as a real migration and deleting the lazy bootstrap.**

Checks are driven by an in-process interval (`src/app/lib/uptime/scheduler.ts`)
started when the dashboard is first loaded. That is deliberately modest and is
the other thing to replace on promotion: a single web process polling its own
table stops when the process is recycled, and multiplies when it is scaled out.
A worker or a `pg_cron` job (as the node cleanup already uses) is the production
shape.

### Known trade-off

Monitor targets are validated for shape but not for destination. This product
exists to reach private infrastructure, so refusing RFC1918 addresses would rule
out the main thing people want to watch — but that makes an authenticated user
able to use the server as an SSRF probe. Acceptable behind the dev gate;
revisit before it ships.

## Notes

`src/pages/*` is leftover from a pre-Next.js version of the app and is still an
active Pages Router root. Do not add new routes there.
