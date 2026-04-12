import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 성능 트레이싱: 10% 샘플링 (프로덕션 트래픽 절감)
  tracesSampleRate: 0.1,

  // 에러 재현을 위한 세션 리플레이: 에러 발생 시 100% 캡처
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.05,

  integrations: [
    Sentry.replayIntegration(),
  ],

  // 개발 환경에서 콘솔 출력 비활성화
  debug: false,
});
