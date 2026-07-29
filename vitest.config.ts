import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules/**', 'e2e/**'],
    // 기본 5000ms는 full-suite 병렬 실행 시 너무 빠듯하다. 고코어 머신/CI에서
    // 워커가 CPU를 오버구독하면 단일 메인스레드 Vite 서버가 모듈 변환을 직렬화하여,
    // 라우트 그래프를 cold-import하는 첫 테스트가 간헐적으로 ~6.5s까지 치솟아 타임아웃났다.
    // (maxWorkers=4 진단 시 0건 — 경합 기인 cold-import 지연이지 실제 hang은 아님.)
    // 워커 percentage 캡은 저코어 CI를 직렬화시키므로, 머신 독립적인 타임아웃 마진으로 해소한다.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // happy-dom 환경 옵션. PreviewFrame 등 iframe을 렌더하는 컴포넌트 테스트에서
    // happy-dom이 iframe src(`/api/v1/preview/...` → localhost:3000)를 실제 로드 시도하며
    // `DOMException NetworkError`를 로그에 다수 출력하던 노이즈를 차단한다. (타임아웃 원인은 아님)
    // v20에서 `disableIframePageLoading`은 deprecated → `navigation.disableChildFrameNavigation` 사용.
    // `disableFallbackToSetURL`(기본 false)은 유지되므로 iframe.src 속성은 그대로 반영되어
    // PreviewFrame 테스트의 src 단언은 깨지지 않는다 (BrowserSettingsFactory deep-merge 확인됨).
    environmentOptions: {
      happyDOM: {
        settings: {
          navigation: {
            disableChildFrameNavigation: true,
          },
        },
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/app/**/callback/route.ts',
        'src/app/**/login/page.tsx',
        'src/app/layout.tsx',
        // 2026-07-28: 서브도메인 패스스루(C-1) 수정과 함께 집계 대상에 편입.
        // 미포함 시 변경 라인이 SonarCloud new_coverage·codecov/patch에서 0%로 계산된다.
        'src/middleware.ts',
        'src/app/api/v1/admin/**/route.ts',
        'src/app/api/v1/auth/**/route.ts',
        'src/app/api/v1/countries/**/route.ts',
        'src/app/api/v1/deploy/route.ts',
        'src/app/api/v1/generate/route.ts',
        // 2026-07-10: 라우트 테스트를 신규 추가하며 집계 대상에 편입
        'src/app/api/v1/generate/regenerate/route.ts',
        'src/app/api/v1/health/route.ts',
        'src/app/api/v1/user-api-keys/route.ts',
        'src/app/api/v1/proxy/route.ts',
        'src/app/api/v1/suggest-apis/route.ts',
        'src/app/api/v1/suggest-context/route.ts',
        'src/app/api/v1/suggest-modification/route.ts',
        // 2026-07-30: #219(추천 쿼터 분리)로 수정하며 편입. 나머지 suggest 라우트는 이미 포함돼 있었다.
        'src/app/api/v1/suggest-preferences/route.ts',
        'src/app/(auth)/**/page.tsx',
        'src/hooks/**',
        'src/lib/**',
        'src/services/**',
        'src/providers/**',
        'src/repositories/**',
        'src/components/**',
        'src/types/**',
      ],
      exclude: ['src/test/**', 'src/components/builder/RePromptPanel.tsx'],
      thresholds: {
        branches: 40,
        functions: 30,
        lines: 45,
        statements: 43,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
