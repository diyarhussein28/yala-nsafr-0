import * as Sentry from '@sentry/nestjs';

// Error tracking, enabled only when SENTRY_DSN is set. Imported before anything else in
// main.ts so the SDK can instrument the HTTP server and database driver.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.APP_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Personal data stays out of error reports: no IPs, cookies or request bodies
    sendDefaultPii: false,
  });
}
