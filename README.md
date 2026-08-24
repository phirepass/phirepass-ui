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
`Users` remain dev-gated behind `useDevSurfaceVisible()`
(`src/hooks/use-dev-surface.ts`, built on `IS_DEV_MODE`) until RBAC can restrict
them to the roles that should see them — see `src/lib/rbac.ts`. That hook also
closes them while demo data is on; see below.

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

## Notifications

Two delivery channels, named as the courier in `phirepass-rs` names them
(`NotificationKind`): **`web.push`** reaches a person at a browser that granted
permission, **`webhook`** reaches a system at a URL it was given. One catalogue
of events (`src/types/notification.ts`) feeds both — the event switches decide
*whether* something is worth sending, the destinations decide where it lands —
and both halves are configured on `/dashboard/notifications`.

| | `web.push` | `webhook` |
|---|---|---|
| Destination | A browser, per browser | A URL, per account |
| Registering it | The browser grants permission | Someone types the URL in |
| Server needs | VAPID keypair | Nothing |
| Authenticity | Payload encrypted to the subscription's keys | HMAC-SHA256 in `X-Phirepass-Signature` |
| Dies by itself | Yes — the push service disowns it, and we prune | No — a dead URL keeps failing until removed |

Tables are `notification_subscriptions`, `notification_webhooks` and
`notification_preferences` — see `docs/notifications-schema.sql`, applied the
same way as the uptime schema:

```bash
psql "$DATABASE_URL" -f docs/notifications-schema.sql
# or, reusing the app's own TLS handling:
node scripts/apply-notifications-schema.mjs --check
node scripts/apply-notifications-schema.mjs --apply
```

Preferences are stored as a jsonb object of *overrides*, so a new event ships
with its default already applied to every account and needs no backfill.

**This app owns the catalogue and the switches; it does not do the sending.**
The two things worth notifying about are both knowable only in `phirepass-rs` —
the server holds the agent's WebSocket, so it knows the instant one drops, and it
runs the uptime scheduler, so it sees each check come back. Both post to
`phirepass-courier`, which reads the `notification_preferences` row this page
writes and delivers to the destinations registered here. `POST
/api/notifications/test` remains, for proving the chain end to end on either
channel without waiting for something to break.

The catalogue is `src/types/notification.ts`, and it is the authority: the Rust
side keeps a copy of the event names and their defaults
(`common/src/notifications.rs`), and nothing fails to compile if the two drift.

| Event | Fires when | Default |
|---|---|---|
| `node.offline` / `node.online` | An agent's socket drops, or comes back | **On** |
| `monitor.down` | A check fails where the last one that reached a verdict did not | Off |
| `monitor.degraded` | A check passes, but not cleanly — slower than `degraded_ms` (`http`), or inside `expiry_warn_days` (`ssl`, `domain`) | Off |
| `monitor.up` | A check passes cleanly after failing or running slow | Off |
| `monitor.success` | **Every** check that passes — evidence checks are running | Off |

Every notification is worded for the kind of check that raised it, because
`degraded` and `down` mean different things per kind — an `http` check reports a
status and a latency, an `ssl` check reports a certificate and its issuer, a
`domain` check reports a registration and its registrar:

```
Monitor down                  Certificate expiring          Domain down
checkout-api — https://…      shop.example.com —            example.com —
unexpected status 503         certificate expires in        registration expired
(expected one of [200])       5 days                        3 days ago
                              Issued by Let's Encrypt R3    Registrar: Namecheap
```

Severity also arrives as a **different icon**, since no browser honours a colour
option on `showNotification`: red for an outage, amber for a degradation, the
ordinary green mark for everything else. All three are the same logo with the
hue rotated, generated from `src/app/icon.svg`:

```bash
node scripts/build-notification-icons.mjs           # after editing the logo
node scripts/build-notification-icons.mjs --check   # verify, exits 1 on drift
```

`public/sw.js` holds the allow-list that turns the severity name on the wire
into an asset — a push payload crosses a third-party service, so it names an
intent rather than carrying a URL.

The first four are edge-triggered: a monitor that has been down all night sends
one `monitor.down`, not one per interval. `monitor.success` is the exception and
the reason it exists — an edge that does not repeat cannot tell "all is well"
apart from "the scheduler stopped", so this one fires on every passing check and
is labelled *Every check* in the settings list. The monitor events ship off
because a fleet has as many monitors as somebody cared to create, on thresholds
nobody has tuned yet, and a first wave of unasked-for alerts is how the whole
feature gets switched off at the channel.

### Webhook destinations *are* validated

The opposite call to the monitor targets above, for the opposite reason. A
monitor probe runs on the user's own agent against their own network; a webhook
delivery is an outbound request made **by this server**, which can reach
Postgres, Redis and the courier's unauthenticated intake. So `parseUrl`
(`src/app/lib/webhooks.ts`) requires https outside dev and refuses loopback,
link-local and RFC1918 literals. The check is on the literal host only — a
name that *resolves* into private space still passes, because closing that
needs an agent that pins the address `fetch` actually connects to.

## Support contact

The footer's **Contact** link and the profile menu's **Contact us** entry
open the same dialog (`src/components/ContactSupportDialog.tsx`), which posts to
`POST /api/contact`. The route sends one transactional email through the
`resend` SDK — nothing is written to Postgres, so a support request survives no
database at all.

One variable configures it, `MAILER_API_KEY` — named for the job rather than
the vendor, so changing providers is a change to `src/app/lib/email.ts` and not
to every environment. Without it the route answers `503` and the dialog says so
rather than failing silently. The sender and the support mailbox are module
constants in that same file: they are properties of the product, not of the
deployment, and the from-domain has to be verified with the mail provider
anyway. `Reply-To` carries the address typed in the form.

The endpoint is deliberately unauthenticated — someone who cannot sign in is
exactly the person who needs it — so it carries a honeypot field and a per-IP
budget of 5 messages an hour in Redis. The rate limit fails open: if Redis is
down the message still goes out, because a support form that quietly stops
accepting mail during a cache outage is the worse failure. When the sender does
have a session, their account email is taken from it and added to the message,
so a request cannot claim to come from someone else's account.

The form asks for no subject line: the topic select is the whole of it, sent as
`[Support] Technical issue`, so support mail sorts on a fixed set of values
instead of on whatever a sender typed. What the message is about is the first
thing in the body.

## Demo mode

A switch in **Settings** fills the dashboard with a sample fleet: eight nodes
across seven countries (cloud servers, a shop till, a warehouse gateway, an
office NAS, a Windows lab box, one offline vault), fourteen uptime monitors
covering every status the UI can draw, and four PAT tokens. It is for showing
the product when there is nothing worth showing — an investor room, a booth, a
screenshot of an account that is not empty.

Three decisions shape it:

- **A user setting, not a deployment flag.** The same production build serves
  it; there is nothing to configure and no separate demo deployment.
- **Entirely in the browser.** `DemoModeProvider` patches `window.fetch` while
  the switch is on and answers the dashboard's own `/api/…` calls from a fixture
  (`src/lib/demo/`). The server is not involved, no authentication is bypassed,
  and the account's real data is never read or written.
- **Including who you are.** `GET /api/profile` is answered from the fixture
  too, so the header names the person the sample fleet belongs to rather than
  the presenter — a mismatch otherwise, and a small privacy leak in a room with
  a projector. The session itself stays real; only the name on screen changes.
- **Not remembered.** The switch is React state — no cookie, no local storage.
  Reloading, or opening a second tab, is back on real data, which is the right
  default for a mode that shows people something untrue.

| Where | What it does |
|---|---|
| `src/components/DemoModeProvider.tsx` | The switch, the `fetch` patch, and `useDemoMode()`. |
| `src/lib/demo/api.ts` | The demo's answer to the API: same status codes, error bodies and validation as `src/app/api/`, or `null` to let the real request go out. |
| `src/lib/demo/fixtures.ts` | The fleet, described in relative terms — "enrolled 96 days ago", "that outage was nine days back at 21:00", "this certificate has four days left". |
| `src/lib/demo/store.ts` | Materialises those specs against the clock on every read, and holds the mutations. |
| `src/components/settings/SettingsPage.tsx` | The switch's home. |

The provider distinguishes what the switch says from what is actually being
served: the fixture loads on demand, so for a moment after the click `fetch` is
still the real one. `useDemoMode()` reports the latter, which is what makes
reacting to it safe — the dashboard layout re-reads the profile when it flips,
and is guaranteed to be answered by the fixture rather than by the real account.
`useDemoModeSwitch()`, which only the settings page uses, reports the former so
the control responds to the click that caused it.

Patching `fetch` is heavier machinery than an API client every page agrees to
use, and it is deliberate: a patch cannot be *forgotten*. A page calling plain
`fetch` — as every page here does — would otherwise quietly show the account's
real nodes beside the sample ones, which is the one failure this mode must not
have. In exchange the patch is narrow: same-origin `/api/…`, one known route
table, everything else straight to the network, removed the moment the switch
goes off. The fixtures load on demand, so nobody who is not giving a demo
downloads them.

Two properties are worth knowing before editing the fixtures:

- **Nothing is stored with a timestamp.** Every wire object is assembled against
  `Date.now()`, so the same story tells on any day and a tab left open over
  lunch does not come back showing a fleet last checked two hours ago. CPU and
  response times drift on slow sines rather than being redrawn at random, which
  is the difference between a gauge that looks alive and one that looks broken.
- **Mutations are real, for as long as the page is open.** Renaming a node,
  creating a monitor, "check now", pausing, revoking a token — all of it lands
  in the in-memory store and shows up on the next poll, and none of it survives
  a reload. Sample nodes are also kept out of the `localStorage` node cache, so
  they cannot resurface as real ones later.

An outage or slowdown window shorter than a monitor's check interval can fall
between two checks and leave no trace, so scripted incidents are written
comfortably longer than the interval. Slow checks never happen by chance: the
strip paints a whole day amber for a single degraded check, so random spikes
would turn every bar on the overview amber and the deliberate slowdowns would
stop meaning anything.

**Dev-gated surfaces are hidden while it is on.** Servers and Users are
unfinished — a mock relay fleet, roles nothing enforces — and a demo is exactly
when an audience cannot tell a placeholder from a shipped feature.
`useDevSurfaceVisible()` requires a dev build *and* demo data off, and both the
menu entries and the pages themselves consult it: hiding a link is not the same
as closing the page, so turning the switch on while standing on one of them
renders the not-found boundary.

**Notifications closes during a demo for a different reason.** That page ships
now — it is not dev-gated — but the demo answers `/api/…` from a fixture and
lets anything it does not recognise through to the real network, and there is no
notifications fixture. Left open, it would sit inside a demo showing the
account's own registered devices beside a sample fleet, which is the one failure
this mode exists to prevent. So it checks `useDemoMode()` alone; give it a
fixture and that check can go too.

The one thing the demo cannot fake is a live session — terminal, SFTP, screen,
tunnels, and service changes all need a WebSocket to an agent that does not
exist. Those actions toast an explanation instead of opening a panel that then
fails, and the demo's `/api/auth/websocket-token` refuses with the same message
as a backstop.

## Notes

`src/pages/*` is leftover from a pre-Next.js version of the app and is still an
active Pages Router root. Do not add new routes there.
