# CI/CD 구현 파일 목록 (Implementation Files)

> CI/CD 자동화에 필요한 모든 설정 파일과 구현 위치를 정리한 문서

---

## 1. 프로젝트 루트 설정 파일

```
CustomWebService/
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # CI 파이프라인 (lint, test, build, security)
│   │   ├── release.yml               # 릴리스 (semantic-release, post-deploy check)
│   │   ├── migrate.yml               # DB 마이그레이션 자동화
│   │   └── scheduled.yml             # 스케줄 작업 (API 점검, 한도 체크, 정리)
│   ├── dependabot.yml                # 의존성 보안 자동 업데이트
│   └── PULL_REQUEST_TEMPLATE.md      # PR 템플릿
│
├── .husky/
│   ├── pre-commit                    # lint-staged 실행
│   └── commit-msg                    # 커밋 메시지 컨벤션 검증
│
├── e2e/                              # E2E 테스트 디렉토리
│   ├── landing.spec.ts               # 랜딩 페이지 테스트
│   ├── catalog.spec.ts               # 카탈로그 탐색 테스트
│   ├── builder-flow.spec.ts          # 빌더 전체 흐름 테스트
│   └── auth.spec.ts                  # 인증 플로우 테스트
│
├── .releaserc.json                   # semantic-release 설정
├── .size-limit.json                  # 번들 사이즈 한도 설정
├── lighthouserc.json                 # Lighthouse CI 설정
├── playwright.config.ts              # Playwright E2E 설정
├── vitest.config.ts                  # Vitest 단위 테스트 설정
├── commitlint.config.js              # 커밋 메시지 린트 설정
├── .prettierrc                       # Prettier 설정
├── .eslintrc.json                    # ESLint 설정 (Next.js 기본)
├── .env.example                      # 환경변수 템플릿 (커밋 대상)
├── .env.local                        # 실제 환경변수 (커밋 제외)
└── .gitignore                        # Git 제외 파일
```

---

## 2. 추가 의존성 (devDependencies)

```bash
# 테스트
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom
pnpm add -D @playwright/test

# 코드 품질
pnpm add -D husky lint-staged
pnpm add -D @commitlint/cli @commitlint/config-conventional

# 번들 분석
pnpm add -D @size-limit/preset-app size-limit

# 릴리스
pnpm add -D semantic-release @semantic-release/commit-analyzer @semantic-release/release-notes-generator @semantic-release/github conventional-changelog-conventionalcommits

# Lighthouse
pnpm add -D @lhci/cli
```

---

## 3. PR 템플릿

```markdown
<!-- .github/PULL_REQUEST_TEMPLATE.md -->

## 변경 사항
<!-- 이 PR에서 변경된 내용을 요약해주세요 -->

## 변경 유형
- [ ] 새 기능 (feat)
- [ ] 버그 수정 (fix)
- [ ] 리팩토링 (refactor)
- [ ] 스타일/UI (style)
- [ ] 문서 (docs)
- [ ] 테스트 (test)
- [ ] 기타 (chore)

## 테스트
- [ ] 단위 테스트 추가/수정
- [ ] E2E 테스트 추가/수정
- [ ] 수동 테스트 완료

## 체크리스트
- [ ] 타입 에러 없음 (`pnpm type-check`)
- [ ] 린트 통과 (`pnpm lint`)
- [ ] 빌드 성공 (`pnpm build`)
- [ ] 환경변수 추가 시 `.env.example` 업데이트
- [ ] DB 스키마 변경 시 마이그레이션 파일 추가

## 스크린샷 (UI 변경 시)
```

---

## 4. commitlint 설정

```javascript
// commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'ci', 'revert'],
    ],
    'subject-max-length': [2, 'always', 100],
    'body-max-line-length': [0, 'always', Infinity],
  },
};
```

```bash
# .husky/commit-msg
pnpm exec commitlint --edit $1
```

---

## 5. Vitest 설정

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/types/**',
        'src/test/**',
        'src/components/ui/**',       // shadcn/ui 제외
        'src/**/*.d.ts',
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom';
```

---

## 6. 관리 API 엔드포인트 (CI/CD 연동용)

### `src/app/api/v1/health/route.ts`

```typescript
// GET /api/v1/health
// 용도: UptimeRobot 모니터링, 배포 후 검증, Supabase 일시정지 방지, 한도 체크
// 인증: 불필요 (공개)

// Response:
{
  "status": "healthy",              // healthy | degraded | unhealthy
  "version": "1.3.0",               // package.json version
  "timestamp": "2026-03-20T12:00:00Z",
  "uptime": 86400,                  // 초
  "checks": {
    "database": "ok",               // ok | error
    "ai_provider": "ok",
    "deployment_service": "ok"
  },
  "limits": {
    "db_usage_mb": 45,
    "db_limit_mb": 500,
    "daily_generations_used": 23,
    "daily_generation_limit": 1500,
    "active_projects": 87,
    "project_limit": 200
  }
}
```

### `src/app/api/v1/admin/cleanup/route.ts`

```typescript
// POST /api/v1/admin/cleanup
// 용도: 스케줄 작업에서 호출하는 정리 API
// 인증: ADMIN_API_KEY (Bearer Token)

// Request:
{ "cleanupType": "inactive_projects" | "old_generated_codes", "daysInactive": 90, "keepVersions": 3 }

// Response:
{ "success": true, "data": { "deletedCount": 5, "freedMB": 12.5 } }
```

---

## 7. CI/CD 파이프라인 실행 요약 다이어그램

```
PR 생성/업데이트
    │
    ▼
┌───────────────────────────────────────────────┐
│  ci.yml (PR 트리거)                            │
│                                               │
│  lint-and-typecheck ──┬──→ unit-test           │
│         (2분)        │       (3분)            │
│                      ├──→ build + bundle      │
│                      │       (4분)            │
│                      └──→ security            │
│                              (2분)            │
│                                               │
│  Vercel: Preview 자동 배포                     │
│  PR 코멘트: CI 결과 + Preview URL + 번들 사이즈  │
└───────────────────────────────────────────────┘
    │
    │ PR 머지 → develop
    ▼
┌───────────────────────────────────────────────┐
│  ci.yml (develop push 트리거)                  │
│                                               │
│  위 4개 Job + e2e-test + lighthouse            │
│                    (8분)     (5분)             │
│                                               │
│  Vercel: develop Preview 자동 배포              │
└───────────────────────────────────────────────┘
    │
    │ develop → main 머지
    ▼
┌───────────────────────────────────────────────┐
│  ci.yml → release.yml → migrate.yml            │
│                                               │
│  CI 전체 → Semantic Release → DB 마이그레이션    │
│           (버전 태그, 릴리스 노트)               │
│                                               │
│  Vercel: 프로덕션 자동 배포                     │
│                                               │
│  Post-Deploy:                                 │
│    Health Check → Smoke Test → Discord 알림    │
└───────────────────────────────────────────────┘
    │
    │ 배포 후 (상시)
    ▼
┌───────────────────────────────────────────────┐
│  상시 모니터링                                  │
│  ├── Sentry: 에러 추적 (실시간)                 │
│  ├── UptimeRobot: 가동 체크 (5분)              │
│  └── Vercel Analytics: 트래픽 (실시간)          │
│                                               │
│  scheduled.yml (스케줄)                        │
│  ├── 매일 06:00: 무료 API 상태 점검             │
│  ├── 매일 09:00: 한도 사용량 체크               │
│  └── 매주 월요일: 비활성 데이터 정리              │
│                                               │
│  dependabot.yml (주간)                         │
│  └── 매주 월요일: 의존성 보안 업데이트 PR          │
└───────────────────────────────────────────────┘
```

---

## 8. 스프린트별 CI/CD 구현 태스크

| Sprint | 태스크 | 파일 |
|--------|--------|------|
| **1** | Husky + lint-staged + commitlint 설정 | `.husky/`, `commitlint.config.js` |
| **1** | CI 기본 (lint + type-check + build) | `.github/workflows/ci.yml` (Job 1, 3) |
| **1** | Vercel 프로젝트 연동 (자동 배포 확인) | Vercel Dashboard |
| **1** | .env.example 작성 | `.env.example` |
| **1** | PR 템플릿 작성 | `.github/PULL_REQUEST_TEMPLATE.md` |
| **2** | Vitest 설정 + 첫 테스트 작성 | `vitest.config.ts`, `src/test/setup.ts` |
| **2** | CI에 단위 테스트 Job 추가 | `ci.yml` (Job 2) |
| **4** | 번들 사이즈 체크 설정 | `.size-limit.json`, `ci.yml` (Job 3) |
| **5** | 보안 스캔 Job 추가 | `ci.yml` (Job 4) |
| **7** | DB 마이그레이션 자동화 | `.github/workflows/migrate.yml` |
| **7** | Dependabot 설정 | `.github/dependabot.yml` |
| **7** | 관리 API (/health, /admin/cleanup) | API Route 구현 |
| **8** | Playwright E2E 테스트 | `playwright.config.ts`, `e2e/` |
| **8** | Lighthouse CI 설정 | `lighthouserc.json`, `ci.yml` (Job 6) |
| **8** | Semantic Release 설정 | `.releaserc.json`, `release.yml` |
| **8** | 스케줄 작업 설정 | `.github/workflows/scheduled.yml` |
| **8** | Discord 알림 연동 | Secrets 설정, 워크플로우 알림 단계 |
| **8** | Post-deploy 검증 자동화 | `release.yml` (post-deploy-check Job) |
