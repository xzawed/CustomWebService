import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'xzawed.xyz' },
      { protocol: 'https', hostname: '*.xzawed.xyz' },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry 조직/프로젝트 슬러그 (sentry.io Dashboard에서 확인)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // 소스맵 업로드 비활성화 (SENTRY_AUTH_TOKEN 미설정 시 빌드 오류 방지)
  silent: true,

  // 소스맵: 프로덕션 빌드에서만 업로드
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // 터널 라우트: Ad Blocker 우회 (선택)
  // tunnelRoute: '/monitoring',

  // Next.js tree shaking 최적화 유지
  disableLogger: true,

  // 빌드 오류를 Sentry 설정 미비로 인해 차단하지 않음
  errorHandler(err) {
    console.warn('[Sentry] Build warning:', err);
  },
});
