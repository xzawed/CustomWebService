# CI/CD 구현 파일 목록 (Implementation Files)

> CI/CD 자동화에 필요한 모든 설정 파일과 구현 위치를 정리한 문서
>
> **범례**: ✅ 구현 완료 | 📋 계획 (미구현)

---

## 1. 프로젝트 루트 설정 파일

```
CustomWebService/
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              ✅ CI 파이프라인 (lint → typecheck → test → build → deploy)
│   │   └── scheduled.yml       ✅ 스케줄 작업 (매일 06:00 KST 무료 API 상태 점검)
│   │   # release.yml           📋 릴리스 자동화 (semantic-release) - 미구현
│   │   # migrate.yml           📋 DB 마이그레이션 자동화 - 미구현
│   ├── dependabot.yml          ✅ 의존성 보안 자동 업데이트 (주간)
│   └── PULL_REQUEST_TEMPLATE.md ✅ PR 템플릿
│
├── src/
│   ├── test/                   ✅ 테스트 유틸리티
│   │   ├── setup.ts            ✅ MSW 서버 초기화 (beforeAll/afterEach/afterAll)
│   │   └── mocks/
│   │       ├── server.ts       ✅ MSW Node 서버 인스턴스
│   │       └── handlers.ts     ✅ xAI Grok API 모의 핸들러
│   └── __tests__/              ✅ 통합 테스트
│       └── api/
│           ├── health.test.ts  ✅ /api/v1/health 통합 테스트 (3개)
│           └── projects.test.ts ✅ /api/v1/projects GET/POST 통합 테스트 (7개)
│
├── vitest.config.ts            ✅ Vitest 단위 테스트 설정
├── .npmrc                      ✅ pnpm 빌드 스크립트 허용 설정
├── .env.example                ✅ 환경변수 템플릿 (커밋 대상)
├── .env.local                  ✅ 실제 환경변수 (커밋 제외, .gitignore)
├── Dockerfile                  ✅ 멀티스테이지 빌드 (deps → builder → runner)
├── railway.json                ✅ Railway 배포 설정
│
# .husky/                       📋 Git 훅 (pre-commit, commit-msg) - 미구현
# e2e/                          📋 Playwright E2E 테스트 - 미구현
# .releaserc.json               📋 semantic-release 설정 - 미구현
# .size-limit.json              📋 번들 사이즈 한도 - 미구현
# lighthouserc.json             📋 Lighthouse CI - 미구현
# playwright.config.ts          📋 Playwright 설정 - 미구현
# commitlint.config.js          📋 커밋 메시지 린트 - 미구현
```

---

## 2. 설치된 devDependencies (현재 상태)

```bash
# 테스트 (✅ 설치 완료)
pnpm add -D vitest@^2 @vitejs/plugin-react@^4
pnpm add -D @testing-library/react @testing-library/user-event
pnpm add -D msw happy-dom

# 미설치 (📋 계획)
# pnpm add -D @playwright/test
# pnpm add -D husky lint-staged
# pnpm add -D @commitlint/cli @commitlint/config-conventional
# pnpm add -D @size-limit/preset-app size-limit
# pnpm add -D semantic-release @semantic-release/github
# pnpm add -D @lhci/cli
```

---

## 3. PR 템플릿 (`.github/PULL_REQUEST_TEMPLATE.md`)

```markdown
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
- [ ] 테스트 통과 (`pnpm test`)
- [ ] 빌드 성공 (`pnpm build`)
- [ ] 환경변수 추가 시 `.env.example` 업데이트
- [ ] DB 스키마 변경 시 마이그레이션 파일 추가
```

---

## 4. Vitest 설정 (현재 실제 `vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',       // 서버사이드 코드 중심 (React 컴포넌트 테스트 없음)
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**', 'src/services/**', 'src/providers/**'],
      exclude: ['src/test/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

```typescript
// src/test/setup.ts
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './mocks/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

---

## 5. 현재 CI 파이프라인 (`.github/workflows/ci.yml`)

```
PR 생성/업데이트 or Push (develop, main)
    │
    ▼
┌───────────────────────────────────────────────────┐
│  ci.yml                                            │
│                                                   │
│  1. lint-and-typecheck (병렬)                      │
│     └── ESLint + TypeScript noEmit                │
│                                                   │
│  2. test (needs: lint-and-typecheck)              │
│     └── pnpm test (Vitest 94개)                   │
│     └── 커버리지 artifact 업로드                   │
│                                                   │
│  3. build (needs: test)                           │
│     └── pnpm build (Next.js)                      │
│                                                   │
│  4. deploy (needs: build)                         │
│     └── main push + 실제 배포 시에만               │
│     └── Railway CLI (`railway up --detach`)       │
└───────────────────────────────────────────────────┘

※ 테스트 실패 시 → 빌드 차단 → 배포 차단
```

---

## 6. 관리 API 엔드포인트 (구현 완료)

### `GET /api/v1/health` ✅

```typescript
// 용도: UptimeRobot 모니터링, 배포 후 검증
// 인증: 불필요 (공개)

// Response:
{
  "status": "healthy",          // healthy | degraded | unhealthy
  "timestamp": "2026-03-24T...",
  "checks": {
    "database": "ok",           // ok | error
    "services": "ok"
  }
}
```

---

## 7. 구현 현황 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| CI 기본 (lint, typecheck, build) | ✅ 완료 | ci.yml |
| 단위 테스트 (Vitest) | ✅ 완료 | 94개 테스트 통과 |
| 통합 테스트 (API 라우트) | ✅ 완료 | health, projects |
| MSW 모킹 설정 | ✅ 완료 | src/test/mocks/ |
| CI 테스트 단계 | ✅ 완료 | test job, 커버리지 artifact |
| Railway 배포 | ✅ 완료 | railway.json, Dockerfile |
| 스케줄 API 점검 | ✅ 완료 | scheduled.yml |
| Dependabot | ✅ 완료 | dependabot.yml |
| PR 템플릿 | ✅ 완료 | PULL_REQUEST_TEMPLATE.md |
| Git 훅 (Husky) | 📋 계획 | pre-commit, commit-msg |
| E2E 테스트 (Playwright) | 📋 계획 | builder 전체 플로우 5개 |
| 번들 사이즈 체크 | 📋 계획 | size-limit |
| Lighthouse CI | 📋 계획 | 성능 지표 |
| Semantic Release | 📋 계획 | 자동 버전 관리 |
| DB 마이그레이션 자동화 | 📋 계획 | migrate.yml |
| Discord 알림 | 📋 계획 | 배포 완료 알림 |
