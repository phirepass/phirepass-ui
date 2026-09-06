# Phirepass UI

UI for Phirepass.

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

## Organisations, roles and members

An **organisation owns** nodes, tokens and monitors; a **user holds a role in
it**. That replaces what came before — `nodes.user_id == jwt.sub`, written out by
hand in five queries here and four checks in `phirepass-rs` — and it is what a
seat, a shared node and an audit log all hang off.

Every account has an organisation from the moment it signs in, so a single
person is not a special case anywhere in the code: they are an organisation with
one owner in it, and the access check is identical for them and for a fifty-seat
customer.

| Role | Reaches |
|---|---|
| `owner` | Everything, plus renaming the workspace and handing ownership on |
| `admin` | Every node in the organisation, and manages members — but cannot touch an owner |
| `member` | Their own nodes, tokens and monitors, and nothing else |

The table is `src/lib/rbac.ts`, and it is the **only** description of the model:
the same `Permission` constant gates the button and the route behind it. That
file is pure and client-safe, which is what lets the server import it.

### Three files, and what each is for

| File | What it owns |
|---|---|
| `src/lib/rbac.ts` | The permission table, and the rules about who may act on whom (`canActOnMember`, `canGrantRole`). No I/O — tested on its own. |
| `src/app/lib/scope.ts` | The SQL predicate, as a pure function. Placeholder numbering is the part that fails silently, so it is tested apart from any database. |
| `src/app/lib/authz.ts` | Where the two meet a request: `requireSession`, `requirePermission`, and the named scopes (`nodeScope`, `nodeManageScope`, `ownedScope`). |

**`buildScope` is the answer to "which rows may this session see", and nothing
else answers it.** Three clauses:

```
(row.org_id = :org  OR  (row.org_id IS NULL AND row.user_id = :me))
AND (:reads_all  OR  row.user_id = :me)
```

Every list, count and detail query composes that fragment rather than writing
its own `WHERE`, which is deliberate: node sharing
(`phirepass-rs/SHARING.md`) is one more `OR` in the second clause, and adding it
there gives it to every route at once.

`phirepass-rs/server/src/access.rs` is the same three clauses in Rust, for the
WebSocket path. Two languages disagreeing about who may reach a node is the
failure that makes an access model impossible to reason about — the symptom is a
dashboard that lists a machine and a terminal that refuses it — so both are
written from this shape and both are tested against the same statements.

### The rules that are enforced, not merely displayed

- **A workspace always has an owner.** The last one cannot be demoted, suspended
  or removed; losing them is unrecoverable without database access.
- **Nobody administers themselves.** Role changes, suspension and removal all
  refuse the caller's own row, so an owner cannot demote their way out of the
  rule above by accident.
- **Promotion to owner is a transfer.** The actor steps down to admin in the same
  statement — one `UPDATE`, so an interruption cannot leave two owners or none.
- **Suspension closes the API, not the buttons.** `requireSession` reads
  membership from Postgres on every request, so it takes effect on the next one
  rather than when a seven-day cookie expires. That includes
  `/api/auth/websocket-token`, which is the credential that opens an SSH session.
- **An invitation cannot grant ownership.** Ownership is transferred to somebody
  who has already signed in, never handed to an address nobody has proved they
  hold.

### Invitations

Sign-in is OAuth, so the invited address usually has no account yet. The
invitation is keyed on the address and **claimed by signing in with it** — the
link in the email is a shortcut to the sign-in page, not the credential, so a
forwarded invitation is no use to anybody else. `claimInvitations` runs in the
OAuth callback, before the session is minted, and lands the person in the
workspace that asked for them rather than in a personal one.

Delivery is best-effort on purpose: a deployment with no `MAILER_API_KEY`, a
provider outage or a bounced address all leave a working invitation behind, and
the members page says so rather than reporting a failure for something that
succeeded.

### Schema and rollout

**The app applies its own schema.** There is nothing to run: starting
`phirepass-ui` against a database brings it up to what this build expects. See
*Schema migrations* below.

The migration is `src/app/lib/migrations/001-organizations.ts` — three tables
(`organizations`, `organization_members`, `organization_invitations`), `org_id`
on `nodes`/`pat_tokens`/`monitors`, `users.primary_org_id`, and a re-runnable
backfill that gives every existing account a personal organisation with
everything it holds reassigned to it.

```bash
node scripts/check-org-schema.mjs --check    # what is there now, and the ledger
node scripts/check-org-schema.mjs --verify   # every count should be zero
```

`org_id` is **nullable** and stays that way through this change, which is what
makes the deploy order free: a row the backfill has not reached is visible to its
owner and to nobody else — exactly the behaviour that existed before. A
`phirepass-rs` that boots first, before the tables exist, treats every caller as
having no membership for the same reason. `phirepass-rs/MIGRATION.md` carries the
ordered entry and the separate `SET NOT NULL` to add once `--verify` is clean.

### Where it shows

`/dashboard/users` is no longer dev-gated. It requires `users:read`, so a plain
member never sees the nav entry or the page, and `/api/org/members` answers 403
to one regardless of what the client decides. It closes during a demo, for the
reason Notifications does: there is no members fixture, and the demo lets
unrecognised routes through to the real network — left open it would list the
presenter's actual colleagues beside a sample fleet.

## Schema migrations

**The app owns its schema and applies it at startup.** There is no migration
tool here and nothing to run by hand: `src/instrumentation.ts` calls
`bootstrapSchema()` once per server instance, before the first request is
served, and every migration in `src/app/lib/migrations/` is applied. Deploying
is migrating.

```
src/app/lib/migrations/index.ts    the ordered list — append only
src/app/lib/migrations/001-*.ts    one migration: an id, a description, the SQL
src/app/lib/migrate.ts             the runner
src/instrumentation.ts             the startup hook Next calls
```

Four properties, each of them a way this otherwise goes wrong:

- **Every migration is re-runnable, and runs on every boot.** Not "once, then
  recorded as done" — a database restored from an old dump, or one that missed a
  deploy, repairs itself by being started against. `schema_migrations` records
  when each id first appeared and how many times it has run; it is a log, not a
  gate.
- **One instance at a time.** A Postgres advisory lock serialises concurrent
  boots. This is not belt-and-braces: `CREATE TABLE IF NOT EXISTS` is **not**
  concurrency-safe — two instances running it at the same moment race on the row
  type Postgres creates alongside the table, and the loser gets
  `duplicate key value violates unique constraint "pg_type_typname_nsp_index"`.
  Five instances started together reproduce it every time.
- **All or nothing, per migration.** Postgres DDL is transactional, so a failure
  part-way leaves the database as it was. Each migration gets its own
  transaction, and the run stops at the first failure rather than applying a
  later change against a database that did not get the earlier one.
- **A failure does not stop the app booting.** A dashboard that refuses to start
  because Postgres had a bad minute is worse than one that starts and errors on
  the routes that need it. It is logged loudly, and the next restart tries again.

The SQL lives in a TypeScript module rather than a `.sql` file read at runtime,
because the standalone build only ships what it can trace through imports — a
file read from disk exists in development and is missing in the container. The
one consequence: a template literal cannot contain a backtick, so SQL comments
use plain identifiers and the prose that wants formatting goes in the doc comment
above.

**Everything is migrated this way.** There is no `docs/` directory any more —
the base tables, organisations, uptime, notifications and MFA are all
migrations. The `pg_cron` statements the uptime schema needs are the one thing
that had to change on the way in: `CREATE EXTENSION` and `cron.schedule` require
privileges the application role may not hold, and a hard failure would be an
error on every restart of a healthy deployment. They are wrapped in a guard that
raises a notice and carries on, and the tables are created either way — neither
job enforces anything a reader depends on. Scheduling is unschedule-then-schedule
so a restart installs the current definition rather than layering on it.

The scripts under `scripts/` are read-only diagnostics now. They tell you what a
database holds; they no longer apply anything.

## Monitoring

`/dashboard/monitor` is shipped and reachable in production. **`Users` is too,
as `Members`** — it is gated on `users:read` now that roles are enforced; see
*Organisations, roles and members* above. `Servers` remains dev-gated behind
`useDevSurfaceVisible()` (`src/hooks/use-dev-surface.ts`, built on `IS_DEV_MODE`)
because it is still a mock relay fleet, not because of RBAC. That hook also
closes it while demo data is on; see below.

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
`src/app/lib/migrations/002-uptime.ts`, applied when the app starts. To see what
a database currently holds, including the scheduled jobs:

```bash
node scripts/check-uptime-schema.mjs --check
node scripts/check-uptime-schema.mjs --cron
```

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
`notification_preferences` — see `src/app/lib/migrations/003-notifications.ts`,
applied when the app starts, like every other schema here:

```bash
node scripts/check-notifications-schema.mjs --check
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
HTTP check failed             Certificate expiring          Domain check failed
checkout-api — https://…      shop.example.com —            example.com —
unexpected status 503         certificate expires in        registration expired
(expected one of [200])       5 days                        3 days ago
                              Issued by Let's Encrypt R3    Registrar: Namecheap
```

The title always names the kind, because it is the line every surface keeps — a
lock screen truncates the body, a shade summary shows one line of it, a history
row shows none — and one host can be watched by all three kinds at once.

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

## Two-factor authentication

Sign-in is GitHub OAuth, and 2FA is the step after it: a six-digit TOTP code
from an authenticator app, checked by this app against a secret it holds. It is
switched on per account in **Settings**, and the whole feature is switched on
per deployment by `NEXT_PUBLIC_MFA_ENABLED` — unset means **on in production,
off everywhere else**, which is the default a forgotten variable should land on
in either direction. Where it is off the endpoints answer `404`, sign-in never
asks for a code, and Settings does not mention it.

**No credential is needed for any of it.** TOTP is RFC 6238 over `node:crypto`
(`src/app/lib/totp.ts`, checked against the RFC's own test vectors), the QR code
is rendered server-side by `qrcode`, and the secret is encrypted with a key
derived from `JWT_SECRET` by HKDF. That last point has one consequence worth
knowing before it bites: **rotating `JWT_SECRET` makes enrolled authenticators
undecryptable.** The rotation already signs everyone out; after it, people
re-enrol using a recovery code, which is hashed rather than encrypted and so
survives.

The flow, once it is on:

| Step | What happens |
|---|---|
| OAuth callback | Account has 2FA → a 10-minute *challenge* cookie, not a session, and a redirect to `/login/verify` |
| `/login/verify` | Six digits, or a recovery code |
| `POST /api/auth/mfa/challenge` | Correct → the session cookie is issued and the challenge cleared |

The challenge token carries `purpose: "mfa"` and `verifyToken` refuses it, so
moving it into the session cookie — which anyone can do to their own browser —
buys nothing. Every code is single-use: the TOTP step it matched is written to
`user_mfa.last_step` in the same `UPDATE` that spends it, so a code read over a
shoulder is not replayable for the rest of its 30 seconds. Wrong answers are
budgeted at 10 per 15 minutes per account in Redis, failing open — the
alternative is a cache outage locking every enrolled account out of the
product.

Turning 2FA **off**, and regenerating recovery codes, both require a current
code. A session that could quietly remove the second factor would not be one.

Recovery codes are ten `XXXXX-XXXXX` strings, shown once, stored as SHA-256 —
not argon2, deliberately: they are 50 bits of machine randomness with no
dictionary to slow down, and a fast digest buys an indexed single-query lookup
instead of ten stretched verifications per attempt.

The two tables are `user_mfa` and `user_mfa_recovery_codes`, in
`src/app/lib/migrations/004-mfa.ts`, applied when the app starts.

They were created by the app itself at startup for the release that introduced
2FA, so that deploy could not land on a database a step behind it; that
bootstrap was then removed and the DDL moved to a file applied by hand. It is
back where it started, and this time it stays — see *Schema migrations*.

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

**Dev-gated surfaces are hidden while it is on.** Servers is unfinished — a mock
relay fleet — and a demo is exactly when an audience cannot tell a placeholder
from a shipped feature.
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
fixture and that check can go too. **Members closes for exactly the same
reason** — no members fixture, and the alternative is a demo listing the
presenter's real colleagues. Its other gate, `users:read`, is a real permission
rather than a placeholder.

The demo's own profile does carry an organisation and a role (`DEMO_ORG`, owner),
because `/api/profile` answers with both now and `useCurrentRole()` reads them —
without it every page would fall back to `member` and hide the controls the
audience is there to see.

The one thing the demo cannot fake is a live session — terminal, SFTP, screen,
tunnels, and service changes all need a WebSocket to an agent that does not
exist. Those actions toast an explanation instead of opening a panel that then
fails, and the demo's `/api/auth/websocket-token` refuses with the same message
as a backstop.

## Notes

`src/pages/*` is leftover from a pre-Next.js version of the app and is still an
active Pages Router root. Do not add new routes there.
