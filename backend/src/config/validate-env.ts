import { Logger } from '@nestjs/common';

const DEV_JWT_DEFAULTS = new Set([
  'dev-secret-change-in-production',
  'change-this-to-a-long-random-secret',
]);

/**
 * Settings that must be right before real users and real money touch the server.
 *
 * Each of these used to fail silently: an unset JWT_SECRET fell back to a string that is
 * public in this repository (anyone could mint admin tokens), PAYMENT_MOCK=true skipped
 * every Kashier call, and the stub SMS provider printed login codes to the log instead of
 * sending them. In production they now stop the boot; elsewhere they are warnings.
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const isProd = env.NODE_ENV === 'production';
  const problems: string[] = [];

  const jwtSecret = String(env.JWT_SECRET ?? '');
  if (!jwtSecret || DEV_JWT_DEFAULTS.has(jwtSecret) || jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be a random secret of at least 32 characters');
  }
  if (String(env.PAYMENT_MOCK ?? '') === 'true') {
    problems.push('PAYMENT_MOCK=true skips every Kashier call and must be false');
  }
  if (!env.SMS_PROVIDER || env.SMS_PROVIDER === 'stub') {
    problems.push('SMS_PROVIDER is "stub" — OTP codes would be logged, never sent');
  }
  for (const key of ['KASHIER_MERCHANT_ID', 'KASHIER_API_KEY', 'KASHIER_SECRET_KEY', 'APP_URL']) {
    if (!env[key]) problems.push(`${key} is not set`);
  }

  if (problems.length > 0) {
    const message = `Configuration problems:\n  - ${problems.join('\n  - ')}`;
    if (isProd) throw new Error(message);
    new Logger('Config').warn(`${message}\n(allowed outside production)`);
  }
  return env;
}
