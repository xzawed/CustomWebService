import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,

  // Edge runtime은 가볍게 유지
  tracesSampleRate: 0.1,

  debug: false,
});
