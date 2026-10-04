# يلا نسافر · Yala Nsafr

Intercity carpooling for Egypt. Drivers post trips they are already making, passengers
book a seat, and the platform holds the fare in escrow until the trip completes — taking
a 10% commission (admin-configurable) and paying the driver out to a mobile wallet or bank
account.

| | |
|---|---|
| **Backend** | NestJS 11 · PostgreSQL · TypeORM (migrations) · Docker deploy with Caddy |
| **Mobile** | Flutter, Riverpod, GoRouter — Arabic-first (RTL) with English, light & dark themes |
| **Payments** | Kashier only — card escrow (authorize → capture), mobile wallets, driver payouts, subscriptions, cash-commission payments |
| **Push / crashes** | Firebase Cloud Messaging · Crashlytics (app) · Sentry (API, optional) |
| **Tests** | 220+ end-to-end API tests against a real Postgres instance, plus Flutter unit tests — all run in CI |

The marketing site lives separately at
[and222row/yala-nsafr-website](https://github.com/and222row/yala-nsafr-website).

---

## What it does

**Trips & booking** — search by route and date (including stops along the way), seat
availability, women-only trips, preferences (smoking, pets, luggage, A/C, chattiness),
exact pickup and drop-off points picked on a map, weekly recurring trips, per-trip comments
and group chat, and shareable trip links (`/t/<id>`) that open the app or show a preview
page. While a trip runs the driver's location is streamed — also with the screen locked —
and passengers see the car, its trail and an ETA on a map; every participant has an SOS
button.

**Money** — card payments are *authorized* at booking and only *captured* when the driver
ends the trip, so a passenger's funds are held rather than taken. Mobile wallets (Vodafone
Cash etc.) can't be held, so they are charged at booking and refunded by policy.
Driver earnings stay on hold for the dispute window before they become withdrawable, and
commission owed on cash trips is netted from card earnings or paid through Kashier — a
driver over the configurable limit can't post new trips until it is settled.
Cancellations resolve by policy (free cancel → void the hold, late cancel → capture then
partially refund, no refund → capture in full). Cash trips skip escrow entirely and are
tracked for commission only.

**Drivers** — ID and licence verification (documents in private storage, served through
short-lived signed links), earnings broken down per trip with a full ledger, withdrawals to
Vodafone Cash / InstaPay / bank, and subscription-gated trip posting. Subscriptions are prepaid periods
(default 200 EGP / 30 days, set in `platform_config`; 0 disables the paywall) paid through
Kashier — Stripe was removed because it does not onboard merchants in Egypt.

**Trust & safety** — blind two-sided ratings revealed after both parties submit (or after 7
days), disputes with admin mediation, user blocking, gender tied to the national ID for
women-only trips, and an escalating ban for drivers who cancel late or never start a trip
(3 strikes → 7-day posting ban, 5 → 30 days, 10 → suspension).

**Automation** — scheduled jobs send pre-departure reminders, auto-cancel abandoned trips,
auto-reject bookings a driver never answers, release seats held by unpaid checkouts, reveal
expired ratings, remind drivers before their subscription lapses, and reconcile captures and
payouts against Kashier.

**Admin** — a web panel at `/admin` (dashboard with charts, verification queue, users,
trips, disputes, withdrawals, live platform settings, broadcast notifications) and the
same tools inside the app for admin accounts. Every admin action is written to an audit log.

**App** — Arabic and English (Profile → Settings → Language, switches live), light and dark
themes, offline banner, forced/optional update prompt driven by the API, push
notifications that open the right screen, and crash reporting.

---

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL 16
- Flutter 3.32+
- A Kashier account (test mode is enough — see [Kashier setup](#kashier-setup))

### 1. Database

`backend/docker-compose.yml` brings up Postgres (and a Redis container the API does not use yet):

```bash
cd backend && docker compose up -d
```

Running Postgres natively instead? Create the role and database to match `.env`:

```bash
psql -U postgres -c "CREATE USER yala_user WITH PASSWORD 'yala_pass';" -c "CREATE DATABASE yala_nsafr OWNER yala_user;"
```

### 2. Backend

```bash
cd backend && npm install && cp .env.example .env
```

Fill in `.env` — at minimum `JWT_SECRET` and the `KASHIER_*` values. Leave
`SMS_PROVIDER=stub` and OTP codes are written to the console instead of being texted.
Set `PAYMENT_MOCK=true` to work without Kashier credentials at all.

```bash
npm run migration:run   # creates the schema
npm run seed            # optional: demo admin, drivers, passengers, trips and history
npm run start:dev
```

`npm run seed` creates accounts on `+2010000000xx` — `+201000000001` is the admin,
`+201000000010`–`12` verified drivers, `+201000000020`–`22` passengers. Sign in with any of
them; with `SMS_PROVIDER=stub` the OTP is printed in the API log.

The API serves on `http://localhost:3000/api/v1`; the admin panel on `http://localhost:3000/admin`.

**Schema changes ship as migrations** (`src/database/migrations`). After changing an entity:

```bash
npm run migration:generate -- src/database/migrations/DescriptiveName
```

Never edit a migration that has been applied anywhere. In production, pending migrations run
automatically at boot (`DB_MIGRATIONS_RUN=false` turns that off). `synchronize` is only used
with `NODE_ENV=development`.

**Production refuses to start** with a default/short `JWT_SECRET`, `PAYMENT_MOCK=true`,
`SMS_PROVIDER=stub`, or missing Kashier keys / `APP_URL`.

### 3. Mobile app

```bash
cd mobile && flutter pub get
```

The app talks to `http://localhost:3000/api/v1`
([`api_client.dart`](mobile/lib/core/api/api_client.dart)). On a **physical Android
device `localhost` is the phone, not your machine**, so map the port back over USB — once
per device, and again after any reconnect:

```bash
adb -s DEVICE_ID reverse tcp:3000 tcp:3000
```

```bash
flutter run -d DEVICE_ID
```

For any build that runs against a real server, pass the API address at build time:

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://api.example.com/api/v1
```

The project needs Flutter 3.32 or newer. Store builds (signing, app links, push, map
tiles) are covered step by step in [`docs/RELEASE.md`](docs/RELEASE.md); running the API
in production in [`deploy/README.md`](deploy/README.md).

**Strings**: every user-facing string goes through `tr('…')` with its English
translation in `lib/core/i18n/en.dart`; `test/i18n_test.dart` fails if one is missing.

Testing driver and passenger side by side is easiest with two devices in two terminals
(`flutter run -d all` works too, but interleaves the logs).

---

## Kashier setup

Kashier splits its API across two hosts, and sending a call to the wrong one returns a
bare `404` that looks like a missing record:

| Host | Handles |
|---|---|
| `api.kashier.io` | payment sessions, payment status, payout reads |
| `fep.kashier.io` | order operations — `CAPTURE`, `VOID`, `REFUND` — and creating transfers |

Prefix both with `test-` for sandbox.

### Account prerequisites

Two things must be enabled by Kashier before the escrow flow works at all:

1. **Authorization Capture** — without it, sessions charge the passenger immediately
   instead of placing a hold, so there is nothing to capture when the trip ends. Requires
   approval from your account manager.
2. **The `refund` permission** on your key's role — voids and refunds return `403`
   without it, which breaks cancellations and booking rejections.

Also note authorization holds **expire after 7 or 30 days** depending on configuration. A
trip booked further ahead than that can no longer be captured, so keep
`MAX_TRIP_LEAD_DAYS` in [`trips.service.ts`](backend/src/modules/trips/trips.service.ts)
inside your window.

### Webhooks

Register **two separate endpoints** — the payloads and signature schemes differ, and a
transaction event delivered to the payout endpoint is silently dropped:

| Events | Endpoint |
|---|---|
| Transaction (authorize, capture, refund…) | `POST /api/v1/kashier/webhooks/transaction` |
| Transfer (initiated, transferred, failed) | `POST /api/v1/kashier/webhooks/transfer` |

Both are verified via the `x-kashier-signature` header, but **do not share a verifier**:

- **Payment** webhooks sort `signatureKeys` alphabetically, URL-encode each value, and key
  the HMAC with the **Payment API Key**.
- **Payout** webhooks use `signatureKeys` in array order with raw values, keyed with the
  **Transfer API Key**.

For local development, expose your machine and point `APP_URL` at the same address. A
fixed subdomain saves re-registering the webhooks every restart:

```bash
npx localtunnel --port 3000 --subdomain your-subdomain
```

### Sandbox payouts

The sandbox picks a transfer outcome from the recipient number — anything unlisted is
treated as an unknown recipient and fails:

| Recipient | Outcome |
|---|---|
| `01111111111` | success → `TRANSFERRED` |
| `01111111112` | timeout → `IN_TRANSIT` |
| `01111111113` | invalid recipient → `FAILED` |
| `01111111114` | insufficient funds → `FAILED` |

A successful transfer settles asynchronously and stays `openForReturn` (the wallet can
still bounce it back), so withdrawals are confirmed by webhook — or by the reconciliation
job, which re-checks recent payouts directly against Kashier.

---

## Tests

```bash
cd backend && npm run test:e2e
cd mobile && flutter analyze && flutter test
```

These run against a **real Postgres database** rather than mocks, with Kashier calls
stubbed. Two consequences worth knowing:

- Jest sets `NODE_ENV=test`, which disables `synchronize` — run `npm run migration:run`
  first. CI (`.github/workflows/ci.yml`) does exactly that on a fresh database, and also
  fails if the entities and migrations have drifted apart.
- Tests that invoke scheduled jobs sweep the whole table. They shield rows they do not
  own and restore them afterwards, so a real trip or withdrawal is not cancelled by a test
  run. Keep that in mind when adding coverage for a cron.

---

## Layout

```
backend/          NestJS API
  src/modules/    admin audit auth blocks bookings disputes earnings location messages
                  notifications payments ratings scheduler share sms sos subscriptions
                  trips upload users
  src/common/     job locks, Cairo-time helpers, serializers, request logging
  src/database/   entities, migrations, seed
  admin-panel/    the web admin (static, served at /admin)
  test/           end-to-end suite
mobile/           Flutter app (lib/core, lib/features, lib/shared)
deploy/           Docker Compose production setup (API, Postgres, Caddy, backups)
docs/             release guide
```

---

## Known gaps

- **Payout webhook signature is unverified against a real delivery.** It follows the
  documented algorithm, but Kashier publishes no test vector for it. If payout webhooks
  start being rejected, the error log prints both the received header and the computed
  payload.
- **Wallet payments** use Kashier's hosted checkout with `allowedMethods=wallet`; verify the
  flow once in the Kashier sandbox with your merchant account before launch.
- **Push notifications need FCM credentials** (`FCM_*` in `.env`) and, for iOS, an APNs key
  uploaded to Firebase; without them notification sends fail silently in the log.
- **Server-sent texts are Arabic.** Push notifications and SMS are written in Arabic for
  every user; the app UI itself is fully bilingual and the user's choice is stored in
  `preferredLanguage`, ready for localized notifications.

---

## License

No license has been chosen yet. All rights reserved by default — if you intend this to be
reusable, add a `LICENSE` file.
