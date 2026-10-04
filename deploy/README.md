# Deploying Yala Nsafr

Single-server deployment with Docker Compose: the API, PostgreSQL, Caddy (automatic
HTTPS) and a nightly database backup.

```bash
cd deploy
cp ../backend/.env.example .env      # then edit — see checklist below
DOMAIN=api.example.com docker compose up -d --build
docker compose logs -f api
```

Point the domain's DNS A record at the server before starting, so Caddy can obtain the
certificate. Database migrations run automatically when the API starts.

## Production checklist

- `JWT_SECRET` — 48+ random bytes (`openssl rand -hex 48`)
- `DB_PASS` — strong password (used by both the database and the API)
- `PAYMENT_MOCK=false`, live `KASHIER_*` keys; register both webhook URLs in Kashier:
  `https://DOMAIN/api/v1/kashier/webhooks/transaction` and `.../webhooks/transfer`
- `SMS_PROVIDER=twilio` or `vonage` with credentials
- `FCM_*` service-account values for push notifications
- `STORAGE_DRIVER=s3` with a private bucket if you run more than one API instance
- `SENTRY_DSN` (optional) for error tracking
- The API refuses to start if any of the critical settings above are unsafe.

## Operations

- Health: `GET /api/v1/health` (also used by the container health check)
- Logs are JSON lines; every response carries an `X-Request-Id` that appears in the log
- Backups: `deploy/backups/*.sql.gz` (14 kept). Restore with
  `gunzip -c FILE | docker compose exec -T db psql -U yala_user yala_nsafr`
- Scaling: scheduled jobs use database locks, so several `api` replicas are safe
