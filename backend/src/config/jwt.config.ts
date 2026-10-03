import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  // validateEnv refuses to boot production without a real JWT_SECRET; the fallback only
  // exists so a fresh development checkout starts.
  secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  // Short-lived: the app and admin panel refresh it automatically, and a short lifetime
  // bounds how long a leaked token stays useful.
  expiresIn: process.env.JWT_EXPIRES_IN || '15m',
}));
