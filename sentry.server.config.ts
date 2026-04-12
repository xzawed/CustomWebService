import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,

  // 서버사이드 성능 트레이싱
  tracesSampleRate: 0.1,

  debug: false,
});
