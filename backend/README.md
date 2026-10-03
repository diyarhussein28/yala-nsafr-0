# Yala Nsafr — Backend

NestJS 11 API. Setup, Kashier configuration, migrations and tests are documented in the
[repository README](../README.md).

```bash
npm install
cp .env.example .env
npm run migration:run
npm run start:dev          # http://localhost:3000/api/v1, admin panel at /admin
npm run test:e2e           # needs a migrated Postgres database
```
