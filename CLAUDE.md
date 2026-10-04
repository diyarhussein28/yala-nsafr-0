# Yala Nsafr — AI Project Guide

Egypt's intercity carpooling platform. Read this before changing code.

## Layout

```
backend/   NestJS 11 API (TypeORM, PostgreSQL, Kashier, FCM)
  src/modules/<feature>/   controller (routes only) · service (logic) · dto/ (class-validator)
  src/database/entities/   TypeORM entities
  src/database/migrations/ schema migrations (the only way schema reaches production)
  src/common/              guards, decorators, serializers/public-user.ts, time/cairo.ts
  admin-panel/index.html   static web admin, served at /admin
  test/                    e2e suites against a real Postgres database
mobile/    Flutter 3.32+ app (Riverpod, GoRouter), Arabic (RTL) + English, light/dark
```

The marketing website lives in a separate repository.

## Commands

```bash
# backend
npm run migration:run                                   # apply schema
npm run start:dev                                       # http://localhost:3000/api/v1
npm run migration:generate -- src/database/migrations/Name   # after changing an entity
npm run test:e2e                                        # needs a migrated database
npx tsc --noEmit -p tsconfig.json                       # type-check

# mobile
flutter run
flutter build apk --release --dart-define=API_BASE_URL=https://.../api/v1
flutter analyze
```

## Rules that matter

**Never edit an applied migration.** Generate a new one. CI fails if entities and migrations drift.

**Never return a raw `User` entity to anyone but that user or an admin.** It carries phone,
national ID number/photo, FCM token, emergency contact, promo balance. Use
`toPublicUser()` / `toBookedDriver()` from `src/common/serializers/public-user.ts`.

**Check ownership on every `:id` endpoint.** Passenger, the trip's driver, or admin.

**`@CurrentUser()` returns the full User entity** — it does not take a field name.

**DECIMAL columns come back as strings** from `pg`. Wrap arithmetic in `Number(...)`.

**`getRawMany()` aliases are lowercased** by Postgres unless quoted (`'"tripCount"'`).

**Dates the user sees are Cairo time.** Use `src/common/time/cairo.ts`, never
`setHours`/`getHours` (the server runs in UTC).

**Status transitions that can race use a conditional UPDATE** (`WHERE status = :expected`)
and check `affected` — see auto-reject, trip completion, payment expiry.

**Never call Kashier inside a DB transaction.** Decide in the transaction, settle after commit
(`PaymentSettlementService`).

## Payments (Kashier only)

- Trip fares: authorize at booking (`manualCapture: true`) → capture when the driver completes
  the trip → void/refund on cancellation per policy. Unpaid checkouts expire after 30 min.
- Driver subscriptions: immediate charge (`manualCapture: false`), merchantOrderId `sub-<id>`,
  handled by `SubscriptionBillingService`. Stripe was removed — it does not support Egyptian
  merchants.
- Driver payouts: Kashier transfers, confirmed by webhook or reconciliation cron.
- Two hosts: `api.kashier.io` (sessions, status reads) and `fep.kashier.io` (capture, void,
  refund, transfers); `test-` prefixed in sandbox.
- Two webhook keys: `/kashier/webhooks/transaction` → `KASHIER_API_KEY` (sorted, URL-encoded);
  `/kashier/webhooks/transfer` → `KASHIER_TRANSFER_API_KEY` (array order, raw). Don't touch the
  HMAC code without a real signed payload to test against.
- Never trust the payment redirect or anything the app sends as proof of payment — ask Kashier.
- `PAYMENT_MOCK=true` skips Kashier for local work; production refuses to boot with it.

## Data model (actual enum values)

| Entity | Field | Values |
|---|---|---|
| user | role | passenger, driver, both, admin |
| user | status | pending_verification, active, suspended, banned |
| trip | status | scheduled, active, completed, cancelled |
| booking | status | pending_payment, pending_driver_approval, confirmed, in_progress, trip_completed, cancelled_by_passenger, cancelled_by_driver, disputed, refunded |
| payment | status | pending (authorized/held), captured, released (voided), refunded, partially_refunded, failed |
| dispute | status | open, under_review, resolved_refund, resolved_release, resolved_split, closed |
| withdrawal_request | status | pending, paid, rejected |

Admin-editable business settings live in `platform_config` (commission, cancellation policy,
dispute windows, rating thresholds, subscription price/period).

## Mobile

- Providers in `lib/features/<feature>/providers/`; invalidate after mutations.
- Routes in `lib/core/router/app_router.dart`.
- `lib/core/api/api_client.dart`: Dio with single-flight token refresh; base URL from
  `--dart-define=API_BASE_URL`.
- Add `MediaQuery.of(context).padding.bottom` to bottom-anchored widgets (Samsung nav bar).
- **Strings**: wrap every user-facing string in `tr('النص العربي', [args])` (placeholders
  `{0}`, `{1}`) and add the English entry to `lib/core/i18n/en.dart`; `test/i18n_test.dart`
  fails otherwise. Don't cache translated strings in globals/static finals — use getters.
  Formatting (dates, money, seat counts) goes through `Fmt`; city/area names through
  `placeName()` / `routeLabel()` (data stays Arabic, display follows the language).
- Colours: use `context.textMuted` / `surfaceColor` / `readable(color)` from
  `app_theme.dart` so dark mode keeps working; open bottom sheets with
  `useRootNavigator: true` so they cover the tab bar.
- Store release steps: `docs/RELEASE.md`. Production deploy: `deploy/README.md`.
