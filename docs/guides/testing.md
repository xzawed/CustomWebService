# 테스트 전략·검증 항목 가이드

> 이 문서는 CustomWebService의 테스트 구조, 각 계층이 무엇을 검증하는지, 모킹 전략, 실행 방법을 설명합니다.

---

## 1. 테스트 전략 개요

### 테스트 피라미드

```
          ┌─────────┐
          │   E2E   │  ~11개 × 3디바이스 (Playwright)
         ─┼─────────┼─
        │ 컴포넌트  │  ~10개 (React, happy-dom)
       ──┼──────────┼──
      │    통합     │  ~109개 (API Routes, Vitest)
     ────┼──────────┼────
    │       단위    │  ~314개 (lib, providers, services, repositories)
    ──────────────────
```

**총 38개 Vitest 파일, 433개 테스트 + 3개 Playwright E2E 파일**

### 핵심 원칙

1. **외부 서비스는 항상 Mock** — Supabase, Claude API는 테스트 환경에서 절대 직접 호출하지 않는다
2. **모듈 격리** — API route 테스트는 `vi.resetModules()` + dynamic import로 모듈 레벨 사이드이펙트를 격리
3. **보안 검증 필수** — SSRF, XSS, 코드 인젝션 검증은 단위/통합 양쪽에서 모두 검증
4. **레이트리밋 경계값** — 429 응답, fail-open 정책, best-effort 보상 등 rate limit 관련 엣지케이스를 명시적으로 검증

### 프레임워크

| 도구 | 용도 |
|------|------|
| [Vitest](https://vitest.dev/) | 단위·통합 테스트 러너 |
| happy-dom | 컴포넌트 테스트용 DOM 환경 |
| MSW (Mock Service Worker) | 외부 HTTP API 모킹 (Claude API) |
| Playwright | E2E 브라우저 테스트 |

---

## 2. 테스트 분류 및 검증 항목

### 2.1 lib 유틸리티 단위 테스트 (15파일, ~167개)

`pnpm test:unit`으로 실행 (대상: `src/lib/**`)

#### 보안 검증

| 파일 | 검증 항목 |
|------|----------|
| `src/lib/ai/codeValidator.test.ts` | `eval()`, `innerHTML`, `document.write`, API키 하드코딩 감지 (정적 분석). HTML 구조 검증, viewport 존재 여부. 구조 점수·모바일 점수·fetchCallCount·placeholderCount 기반 품질 평가 |
| `src/lib/utils/sanitizeCss.test.ts` | CSS XSS 차단: `expression()`, `url(javascript:)`, `behavior:`, `-moz-binding:` — 생성된 CSS가 브라우저에서 임의 스크립트를 실행하지 못하도록 |

#### AI 코드 생성 파이프라인

| 파일 | 검증 항목 |
|------|----------|
| `src/__tests__/lib/ai/generationPipeline.test.ts` | 3-stage 파이프라인(Stage1→Stage2Function→Stage3) 순차 실행, `generateCodeStream` 3회 호출, stage별 올바른 프롬프트 전달, progress 이벤트 순서, Stage1 실패 시 이후 stage 중단, `codeRepo.create` 정확히 1회 |
| `src/__tests__/lib/ai/promptBuilder.test.ts` / `src/lib/ai/promptBuilder.test.ts` | Stage1·Stage2 시스템 프롬프트 내용(보안 규칙·모바일 퍼스트·코드 패턴), 사용자 프롬프트에 API·엔드포인트·exampleCall 포함, placeholder blocklist(로딩 스피너·더미 데이터 금지), no mock data mandate |
| `src/lib/ai/codeParser.test.ts` | 마크다운 코드블록에서 HTML/CSS/JS 파싱, `assembleHtml()` — CSS·JS 주입, OG 태그, 파비콘, 이미지 lazy loading, 모바일 안전 CSS, viewport 자동 주입 |
| `src/lib/ai/qualityLoop.test.ts` | `shouldRetryGeneration()` — 점수 40점 미만·모바일 점수 미달·fetchCallCount 0·placeholder 잔존 시 재시도 결정. `buildQualityImprovementPrompt()` — 재시도 프롬프트 생성 |

#### QC (Quality Control)

| 파일 | 검증 항목 |
|------|----------|
| `src/lib/qc/renderingQc.test.ts` | Playwright 기반 렌더링 QC: `checkConsoleErrors`(JavaScript 에러 없음), `checkHorizontalScroll`(가로 스크롤 없음), `checkFooterVisible`(푸터 접근성), `checkTouchTargets`(모바일 터치 영역 44px 이상). `isQcEnabled` 환경변수 제어, `shouldRetryGeneration` + `QcReport` 통합 |

#### 인프라 유틸리티

| 파일 | 검증 항목 |
|------|----------|
| `src/__tests__/lib/db/failover.test.ts` | Circuit Breaker: `isDbConnectionError` 판별, NORMAL→TRIPPED 상태 전환(실패 임계값 도달), 윈도우 밖 실패 카운트 리셋, `FAILOVER_ENABLED=false` 시 항상 NORMAL |
| `src/lib/encryption.test.ts` | AES-256-GCM 암호화·복호화 라운드트립, IV 랜덤성(동일 입력에 다른 암호문), 형식 검증, `ENCRYPTION_KEY` 미설정 시 에러, `maskApiKey` 마스킹 |
| `src/lib/utils/errors.test.ts` | 에러 클래스별 올바른 HTTP statusCode 반환(NotFoundError→404, AuthRequired→401, Forbidden→403, RateLimit→429, Generation→500), `handleApiError` — AppError/일반Error/ZodError 분기 처리 |
| `src/lib/config/providers.test.ts` | `getDbProvider()` — `supabase`(기본)/`postgres`/미설정/알 수 없는 값 처리. `getAuthProvider()` — `supabase`/`authjs` 분기 |
| `src/lib/ai/categoryDesignMap.test.ts` | 카테고리별 디자인 테마 추론(금융→modern-dark, 날씨→ocean-blue, 빈 배열→clean-light), `useMap`·`useChart`·`allowedSections` 힌트 |
| `src/lib/auth/authorize.test.ts` | `assertOwner()` — 소유자 일치/불일치/빈 문자열 엣지케이스 |
| `src/lib/ai/slugSuggester.test.ts` | AI 기반 slug 추천: 유효한 형식, 예약어 필터링, AI 에러 시 빈 배열 반환, 중복 제거, 50자 초과 자르기 |
| `src/__tests__/lib/correlationId.test.ts` | UUID 생성, 요청 간 유니크성, `X-Correlation-Id` 헤더 추출, `setCorrelationId` |

---

### 2.2 Provider 단위 테스트 (2파일, ~30개)

`pnpm test:unit`으로 실행 (대상: `src/providers/**`)

| 파일 | 검증 항목 |
|------|----------|
| `src/providers/ai/ClaudeProvider.test.ts` | `name`·`model` 속성, `generateCode` — content·token·durationMs 반환. API 에러 처리. `generateCodeStream` — 청크 누적. `withRetry` — 429·500·503 재시도(최대 2회, 지수 백오프), 400·401 즉시 실패. `checkAvailability`. `cache_control` 블록 배열 전달(Prompt Caching) |
| `src/providers/ai/AiProviderFactory.test.ts` | 태스크별 모델 선택(generation→Opus 4.7, suggestion→Haiku 4.5), `AI_MODEL_GENERATION` 환경변수 오버라이드, 허용되지 않은 모델 ID 설정 시 기본값으로 폴백, 싱글톤 캐시(동일 태스크·모델이면 동일 인스턴스), `clearCache()` |

---

### 2.3 Service 단위 테스트 (3파일, ~28개)

| 파일 | 검증 항목 |
|------|----------|
| `src/services/projectService.test.ts` | `create` — API 수 초과(5개 이상), 컨텍스트 길이(50~2000자), 존재하지 않는 API ID, 사용자 프로젝트 한도 초과. `getById` — NotFoundError, ForbiddenError(타인 프로젝트). `delete`. `publish` — 첫 게시 시 slug 자동 할당, 충돌 시 suffix(-2~-10) 추가, PostgreSQL unique violation(23505) 시 1회 재시도, 재게시 시 기존 slug 유지, 미완성 프로젝트 게시 차단 |
| `src/__tests__/services/rateLimitService.test.ts` | `checkAndIncrementDailyLimit` — 한도 미달 시 허용, 한도 초과 시 RateLimitError, DB 에러 시 **fail-open**(요청 허용). `decrementDailyLimit` — 생성 실패 후 best-effort 보상(에러 스왈로우). `getCurrentUsage` — DB 에러 시 0 반환(UI 보호) |
| `src/services/deployService.test.ts` | `deploy` — NotFoundError(프로젝트 없음), ForbiddenError(타인 소유), ValidationError(코드 없음), 정상 배포(deployUrl 반환), DEPLOYMENT_STARTED·DEPLOYMENT_COMPLETED 이벤트 발행, 실패 시 이전 status 복원 + DEPLOYMENT_FAILED 이벤트, `onProgress` 콜백 순서 |

---

### 2.4 Repository 단위 테스트 (3파일, ~29개)

| 파일 | 검증 항목 |
|------|----------|
| `src/__tests__/repositories/codeRepository.test.ts` | `countByProject`, `pruneOldVersions` — 삭제 대상 있음/없음/오류 처리, `getNextVersion` |
| `src/__tests__/repositories/eventRepository.test.ts` | `persist` — 정상 삽입, DB 오류 best-effort(에러 스왈로우), context 없음, payload에서 `projectId` 자동 추출. `persistAsync`. `findByUser` — limit 100 cap(요청값 초과 시 100으로 고정) |
| `src/__tests__/repositories/catalogRepository.test.ts` | `toDomain` JSONB 매퍼: `verificationStatus`, `verifiedAt`, `parseEndpoints` — `exampleCall`·`responseDataPath`·`requestHeaders` snake_case↔camelCase 이중 처리(DB 직접 삽입 vs 코드 경로 차이). `getApiUsageFromProjects`, `getActiveNameToIdMap`, `ping`, `getUsageCounts` |

---

### 2.5 API Route 통합 테스트 (11파일, ~109개)

`pnpm test:integration`으로 실행 (대상: `src/app/api/**`)

> **공통 검증 패턴**: 인증 없음(401) → 잘못된 입력(400) → 타인 리소스(403) → 비즈니스 규칙(422/429) → 성공 응답

#### 코드 생성 관련

| 파일 | 엔드포인트 | 주요 검증 항목 |
|------|-----------|---------------|
| `generate.test.ts` | `POST /api/v1/generate` | SSE 스트리밍 포맷(data:/event: 헤더), 레이트리밋 초과 시 429 SSE 에러 이벤트, AI 실패 시 `decrementDailyLimit` 보상 호출, 보안 검증 실패 시 generation 중단, `templateId` 힌트 전달 |

#### 보안 관련

| 파일 | 엔드포인트 | 주요 검증 항목 |
|------|-----------|---------------|
| `proxy.test.ts` | `GET /api/v1/proxy` | **SSRF 방지**: loopback(127.0.0.1/::1), RFC1918 사설 IP(10.x/172.16-31.x/192.168.x), AWS 메타데이터 서버(169.254.169.254), 6가지 패턴 모두 차단. path traversal(`../`), double slash(`//`), UUID 형식 검증. 분당 60회 rate limit, upstream 타임아웃 시 502 |

#### 배포·게시·관리

| 파일 | 엔드포인트 | 주요 검증 항목 |
|------|-----------|---------------|
| `deploy.test.ts` | `POST /api/v1/deploy` | SSE progress 이벤트 순서(10%→20%→...→100%), 일일 배포 rate limit, 플랫폼 유효성(railway/github_pages), DEPLOYMENT_FAILED 이벤트 |
| `preview.test.ts` | `GET /api/v1/preview/[id]` | 정상 HTML 응답 + CSP 헤더 포함, `version` 쿼리 파라미터 검증 |
| `projects-publish.test.ts` | `POST /DELETE /api/v1/projects/[id]/publish` | slug 전달, body 파싱 실패 허용(slug 없이도 게시 가능), QC 경고, 게시 취소(slug 제거) |
| `projects-rollback.test.ts` | `POST /api/v1/projects/[id]/rollback` | version 유효성, 지정 버전 미존재, 롤백 성공(새 버전 생성) + 이벤트 발행 |
| `projects-slug-check.test.ts` | `POST /api/v1/projects/[id]/slug/check` | 예약어(`api`, `admin`, `www` 등), 중복 slug, 자기 프로젝트 slug 재사용은 허용 |
| `admin.test.ts` | 관리자 API | Bearer 토큰 인증(`Authorization: Bearer <key>`), QC rate limit(60회/분), ENABLE_RENDERING_QC=false 상태 처리 |

#### AI 추천 관련

| 파일 | 엔드포인트 | 주요 검증 항목 |
|------|-----------|---------------|
| `suggest-apis.test.ts` | `POST /api/v1/suggest-apis` | context 길이(50~2000자), Claude 기반 API 추천, 파싱 실패 시 빈 배열, 존재하지 않는 API ID 필터링 |
| `suggest-context.test.ts` | `POST /api/v1/suggest-context` | apis 배열 검증(최대 5개), AI 응답 JSON 파싱, 파싱 실패 시 빈 배열 반환 |

#### 인프라

| 파일 | 엔드포인트 | 주요 검증 항목 |
|------|-----------|---------------|
| `health.test.ts` | `GET /api/v1/health` | DB 연결 정상: `healthy` 또는 `degraded`, DB 연결 실패: `unhealthy`, `usage` 필드(일일 생성 수) 포함 |

---

### 2.6 컴포넌트 테스트 (2파일, ~10개)

`src/**/*.test.tsx` — happy-dom 환경

| 파일 | 검증 항목 |
|------|----------|
| `src/components/dashboard/PublishDialog.test.tsx` | AI 추천 slug 라디오 버튼 선택, 커스텀 slug 입력 폼, slug 가용성 체크 후 버튼 활성화, 취소 버튼·ESC 키 동작 |
| `src/components/dashboard/RePromptSection.test.tsx` | 버전 번호 표시, `projectId` props 전달, `onRegenerationComplete` 시 `router.refresh()` 호출 및 버전 업데이트 |

---

### 2.7 E2E 테스트 — Playwright (3파일, ~11개 × 3디바이스)

`pnpm test:e2e`로 실행

**대상 디바이스:** mobile(iPhone 14), tablet(iPad Mini), desktop(Desktop Chrome)

| 파일 | 검증 항목 |
|------|----------|
| `e2e/health.spec.ts` | `GET /api/v1/health` → 200, `GET /api/v1/catalog` → 200 |
| `e2e/pages/landing.spec.ts` | 페이지 로드 성공, 헤더·푸터 표시, CTA 버튼 존재, 가로 스크롤 없음, 콘솔 에러 없음 |
| `e2e/pages/catalog.spec.ts` | API 카드 렌더링(최소 1개 이상), 가로 스크롤 없음 |

**헬퍼 함수** (`e2e/helpers/responsive.ts`):
- `checkNoHorizontalScroll(page)` — `scrollWidth > clientWidth` 조건 검사
- `checkNoConsoleErrors(page)` — `console.error` 이벤트 감지

> E2E는 반응형 레이아웃 회귀를 검증하는 데 초점. 코드 생성 등 AI 기능은 단위·통합 계층에서 검증.

---

## 3. 모킹 전략

### 외부 HTTP API — MSW

```typescript
// src/test/mocks/handlers.ts
// Claude API 전체를 MSW로 인터셉트
http.post('https://api.anthropic.com/v1/messages', () => {
  return HttpResponse.json({
    content: [{ type: 'text', text: '```html\n...\n```' }],
    model: 'claude-sonnet-4-6',
    usage: { input_tokens: 100, output_tokens: 500 },
  });
});
```

`src/test/setup.ts`에서 `server.listen()` / `server.resetHandlers()` / `server.close()` 라이프사이클 관리.

### 내부 모듈 — vi.mock

```typescript
// Supabase 클라이언트 mock
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

// 서비스·리포지토리 팩토리 mock
vi.mock('@/services/factory', () => ({
  createProjectService: vi.fn(),
}));
```

### API Route 모듈 격리 — vi.resetModules

API route는 모듈 레벨에서 `registerEventPersister()` 같은 사이드이펙트가 실행되므로, 테스트 간 오염을 막기 위해 매 테스트마다 모듈을 재로딩:

```typescript
beforeEach(async () => {
  vi.resetModules();
  // mock 재설정 후 dynamic import
  const { POST } = await import('@/app/api/v1/generate/route');
  // ...
});
```

### 환경변수 격리

```typescript
const originalEnv = process.env;
beforeEach(() => { process.env = { ...originalEnv }; });
afterEach(() => { process.env = originalEnv; });
```

### 싱글톤 캐시 초기화

```typescript
// AiProviderFactory 내부 Map 초기화
AiProviderFactory.clearCache();

// DB/Auth provider 감지 캐시 초기화
_resetProviderCache();
```

### global fetch 모킹 (proxy 테스트)

```typescript
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
  new Response('<html>...</html>', { status: 200 })
));
```

---

## 4. 실행 명령어

| 명령어 | 대상 | 용도 |
|--------|------|------|
| `pnpm test` | 전체 Vitest | 커밋 전 전체 검증 |
| `pnpm test:unit` | `src/lib`, `src/providers` | 빠른 단위 테스트만 |
| `pnpm test:integration` | `src/app/api` | API route 통합 테스트만 |
| `pnpm test:coverage` | 전체 + 커버리지 | 커버리지 리포트 생성 |
| `pnpm test:e2e` | `e2e/` | Playwright E2E (실행 중인 서버 필요) |
| `pnpm test:e2e:ui` | `e2e/` | Playwright UI 모드 (디버깅용) |
| `pnpm test:prod` | standalone 빌드 | 프로덕션 빌드 후 헬스체크 스모크 테스트 |

---

## 5. CI 파이프라인 연동

GitHub Actions (`.github/workflows/`) 실행 순서:

```
push/PR
  ↓
lint (ESLint)
  ↓
type-check (tsc --noEmit)
  ↓
test (pnpm test — 433개)
  ↓
build (Next.js standalone)
  ↓
[PR only] e2e (Playwright, retries=1)
  ↓
[main push] deploy → Railway
```

테스트 실패 시 빌드·배포 단계로 진행하지 않는다.

---

## 6. 커버리지 기준

**대상 디렉터리**: `src/lib/**`, `src/services/**`, `src/providers/**`, `src/repositories/**`

**임계값** (미달 시 CI 실패):

| 지표 | 임계값 |
|------|--------|
| branches | 50% |
| functions | 60% |
| lines | 60% |
| statements | 60% |

커버리지 리포트 생성: `pnpm test:coverage` → `coverage/` 디렉터리

---

## 7. 테스트 작성 가이드

### 파일 위치 규칙

- **단위 테스트**: 소스 파일 옆 co-located (`src/lib/foo/bar.test.ts`)
- **API route 통합 테스트**: `src/__tests__/api/`
- **서비스·리포지토리 통합 테스트**: `src/__tests__/services/`, `src/__tests__/repositories/`
- **컴포넌트 테스트**: 소스 옆 co-located (`src/components/**/*.test.tsx`)
- **E2E 테스트**: `e2e/`
- **테스트 헬퍼·설정**: `src/test/`

### 필수 mock 조합 (AiProviderFactory 사용 시)

```typescript
vi.mock('@/providers/ai/AiProviderFactory', () => ({
  AiProviderFactory: {
    create: vi.fn(),
    createForTask: vi.fn(),
    clearCache: vi.fn(),
  },
}));
```

> `create`와 `createForTask` 모두 포함하지 않으면 runtime error 발생.

### vi.mock factory 안에서 top-level 변수 참조 금지

```typescript
// ❌ 잘못된 예 — hoisting으로 인해 undefined
const mockFn = vi.fn();
vi.mock('@/lib/foo', () => ({ fn: mockFn }));

// ✅ 올바른 예
vi.mock('@/lib/foo', () => ({ fn: vi.fn() }));
```

### 코드 생성 품질 채점 기준

수동 테스트·QA 시 아래 기준으로 평가:

| 점수 | 기준 |
|------|------|
| 5 | 코드 복사 → 바로 동작, 디자인 우수, 에러 처리 완벽 |
| 4 | 경미한 수정으로 동작, 디자인 양호 |
| 3 | 일부 수정 필요하지만 구조는 올바름 |
| 2 | 상당한 수정 필요, 일부 기능 누락 |
| 1 | 동작하지 않거나 요청과 무관한 결과 |

**최소 합격 기준: 평균 3.5점 이상**
