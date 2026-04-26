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
         │    통합     │  ~110개 (API Routes, Vitest)
        ────┼──────────┼────
       │       단위    │  ~947개 (lib, providers, services, repositories)
       ──────────────────
```

**총 81개 Vitest 파일, 1,078개 테스트 + 3개 Playwright E2E 파일**

### 핵심 원칙

1. **외부 서비스는 항상 Mock** — Supabase, Claude API, GitHub API, Railway API는 테스트 환경에서 절대 직접 호출하지 않는다
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

### 2.1 lib 유틸리티 단위 테스트 (~35파일, ~550개)

`pnpm test:unit`으로 실행 (대상: `src/lib/**`)

#### 보안 검증

| 파일 | 검증 항목 |
|------|----------|
| `src/lib/ai/codeValidator.test.ts` | `eval()`, `innerHTML`, `document.write`, API키 하드코딩 감지 (정적 분석). HTML 구조 검증, viewport 존재 여부. 구조 점수·모바일 점수·fetchCallCount·placeholderCount 기반 품질 평가 |
| `src/lib/utils/sanitizeCss.test.ts` | CSS XSS 차단: `expression()`, `url(javascript:)`, `behavior:`, `-moz-binding:`, 프로토콜 상대 URL(`url(//evil.com)`) — 생성된 CSS가 브라우저에서 임의 스크립트를 실행하지 못하도록 |
| `src/lib/utils/adminAuth.test.ts` | `verifyAdminKey()` 타이밍 공격 방어 (HMAC 상수시간 비교), CORS 헤더 적용 |
| `src/lib/db/errors.test.ts` | `isUniqueViolation()` — Supabase `{code:'23505'}` / Drizzle Error 인스턴스 양쪽 감지 |

#### AI 코드 생성 파이프라인

| 파일 | 검증 항목 |
|------|----------|
| `src/lib/ai/generationPipeline.test.ts` | `evaluateComplexityScore()` — API 수·인증 방식·엔드포인트·컨텍스트·결제 키워드 5종 신호 스코어링, 35pt 임계값 경계값 검증 |
| `src/lib/ai/stageRunner.test.ts` | `runStage1`/`runStage2Function`/`runStage3` 각 stage 실행, Extended Thinking 분기, `isCancelled` 중단 처리 |
| `src/lib/ai/generationSaver.test.ts` | Supabase/Drizzle 경로별 코드 저장, 트랜잭션 롤백, QC 통합, slugSuggester 연동 |
| `src/__tests__/lib/ai/promptBuilder.test.ts` | Stage1·Stage2 시스템 프롬프트 내용(보안 규칙·모바일 퍼스트·코드 패턴), placeholder blocklist |
| `src/lib/ai/codeParser.test.ts` | 마크다운 코드블록에서 HTML/CSS/JS 파싱, `assembleHtml()` — CSS·JS 주입, OG 태그, viewport 자동 주입 |
| `src/lib/ai/qualityLoop.test.ts` | `shouldRetryGeneration()` — 점수 40점 미만·fetchCallCount 0·placeholder 잔존 시 재시도 결정 |
| `src/lib/ai/slugSuggester.test.ts` | AI 기반 slug 추천: 유효한 형식, 예약어 필터링, AI 에러 시 빈 배열 반환 |

#### QC (Quality Control)

| 파일 | 검증 항목 |
|------|----------|
| `src/lib/qc/renderingQc.test.ts` | Playwright 기반 렌더링 QC: 콘솔 에러 없음, 가로 스크롤 없음, 푸터 접근성, 터치 타겟 44px 이상 |

#### 인프라 유틸리티

| 파일 | 검증 항목 |
|------|----------|
| `src/__tests__/lib/db/failover.test.ts` + `src/lib/db/failover.test.ts` | Circuit Breaker: 상태 전환(NORMAL→TRIPPED), `isDbConnectionError` 7종 에러 감지, `FAILOVER_ENABLED=false` |
| `src/lib/db/errors.test.ts` | `isUniqueViolation()` — Supabase/Drizzle 양쪽 23505 감지 |
| `src/lib/encryption.test.ts` | AES-256-GCM 라운드트립, IV 랜덤성, 32바이트 키 검증, `maskApiKey` |
| `src/lib/utils/errors.test.ts` | 에러 클래스별 HTTP statusCode, `handleApiError` — AppError/ZodError 분기 |
| `src/lib/config/providers.test.ts` | `getDbProvider()` / `getAuthProvider()` 환경변수 분기 |
| `src/lib/events/eventBus.test.ts` | `on`/`emit`/`unsubscribe`, 복수 핸들러, 에러 격리 |
| `src/lib/events/eventPersister.test.ts` | `registerEventPersister()` 멱등성, 이벤트 → DB 자동 저장, 실패 시 logger.warn |
| `src/lib/utils/slugify.test.ts` | `toSlug`/`generateSlug`/`isValidSlug`, 예약어(www/api/admin/dashboard) 필터링 |
| `src/lib/utils/publishUrl.test.ts` | 환경별 URL 생성 (localhost/127.0.0.1/production) |
| `src/lib/utils/htmlTitle.test.ts` | `extractTitle()` — `<title>` 파싱, 대소문자 무관, 없으면 null |
| `src/lib/utils/adminAuth.test.ts` | `withAdminCors` CORS 헤더, `verifyAdminKey` 타이밍 공격 방어 |
| `src/lib/services/popularServices.test.ts` | `pickTopIds`/`computePopularServices`/`resolveCuratedServices`, `CURATED_SERVICES` 구조 검증 |
| `src/lib/templates/siteError.test.ts` | `notFoundHtml`/`preparingHtml` HTML 구조, XSS 이스케이프 (`<script>` → `&lt;script&gt;`) |
| `src/lib/apiKeyGuides.test.ts` | `getApiKeyGuide` — 알려진 API 반환, 미등록 API null, 공공데이터포털 계열 공유 가이드 |
| `src/lib/ai/categoryDesignMap.test.ts` | 카테고리별 디자인 테마 추론 |
| `src/lib/auth/authorize.test.ts` | `assertOwner()` — 소유자 일치/불일치 |
| `src/__tests__/lib/correlationId.test.ts` | UUID 생성, `X-Correlation-Id` 헤더 추출 |
| `src/lib/deploy/githubService.test.ts` | `createRepository`(422 중복 처리), `pushCode`(6-step fetch 체인), `setSecrets`(libsodium no-op), `enableGithubPages`(409 충돌 처리) |
| `src/lib/deploy/railwayService.test.ts` | GraphQL 래퍼(`graphql()`), `createProject`/`createServiceFromRepo`/`setEnvironmentVariables`(환경 없음 분기)/`triggerDeploy`/`getDeploymentStatus`/`getServiceDomain`/`generateServiceDomain`/`deleteProject` |

---

### 2.2 Provider 단위 테스트 (~5파일, ~80개)

`pnpm test:unit`으로 실행 (대상: `src/providers/**`)

| 파일 | 검증 항목 |
|------|----------|
| `src/providers/ai/ClaudeProvider.test.ts` | `generateCode`/`generateCodeStream`, API 에러, `withRetry` 지수 백오프, `cache_control` Prompt Caching |
| `src/providers/ai/AiProviderFactory.test.ts` | 태스크별 모델 선택, `AI_MODEL_GENERATION` 환경변수 오버라이드, 싱글톤 캐시 |
| `src/providers/deploy/DeployProviderFactory.test.ts` | `create()` 캐싱, `getSupportedPlatforms()`, 미지원 플랫폼 에러 |
| `src/providers/deploy/GithubPagesDeployer.test.ts` | 배포 전체 플로우, `resolveRepo` GitHub 저장소 조회/생성 분기 |
| `src/providers/deploy/RailwayDeployer.test.ts` | Railway GraphQL 기반 배포 전체 플로우, 상태 폴링, 롤백 |

---

### 2.3 Service 단위 테스트 (~5파일, ~75개)

| 파일 | 검증 항목 |
|------|----------|
| `src/services/projectService.test.ts` | `create` 입력 검증, `publish` slug 자동 할당·충돌 재시도(23505), `unpublish`, `getByUserId`, `getProjectApiIds`, `updateStatus` |
| `src/__tests__/services/rateLimitService.test.ts` | fail-open 정책, `decrementDailyLimit` 에러 스왈로우, `getCurrentUsage` 0 폴백 |
| `src/services/deployService.test.ts` | 정상 배포, DEPLOYMENT_STARTED/COMPLETED/FAILED 이벤트, 실패 시 status 복원 |
| `src/services/catalogService.test.ts` | `search`(totalPages 계산), `getById`, `getCategories`, `getByIds` |
| `src/services/factory.test.ts` | `createProjectService`/`createCatalogService`/`createDeployService`/`createRateLimitService` — SupabaseClient 전달 |

---

### 2.4 Repository 단위 테스트 (~20파일, ~270개)

#### Drizzle ORM 구현체 (postgres 경로)

| 파일 | 검증 항목 |
|------|----------|
| `src/__tests__/repositories/drizzleCatalogRepository.test.ts` | findById/findMany/create/update/delete/count/search(카테고리·키워드 필터)/getCategories/findByIds/getApiUsageFromProjects/getActiveNameToIdMap/ping/getUsageCounts |
| `src/__tests__/repositories/drizzleUserRepository.test.ts` | findById/findMany/create/update/delete/count/createWithAuthId/findByEmail |
| `src/__tests__/repositories/drizzleUserApiKeyRepository.test.ts` | upsert/delete/findByUserAndApi/findAllByUser/updateVerificationStatus |
| `src/__tests__/repositories/drizzleEventRepository.test.ts` | persist(성공·실패)/persistAsync/findByUser(limit 100 cap) |
| `src/__tests__/repositories/drizzleRateLimitRepository.test.ts` | checkAndIncrementDailyLimit/decrementDailyLimit/getCurrentUsage/checkAndIncrementDailyDeployLimit |
| `src/__tests__/repositories/drizzleProjectRepository.test.ts` | 8개 메서드 전체, `projectRowToDomain` 매핑 |
| `src/__tests__/repositories/drizzleCodeRepository.test.ts` | countByProject/pruneOldVersions/getNextVersion/`codeRowToDomain` 매핑 |

#### Supabase 구현체

| 파일 | 검증 항목 |
|------|----------|
| `src/repositories/base/BaseRepository.test.ts` | findById(PGRST116 null)/findMany(필터·null count)/create/update(updated_at 자동)/delete/count(필터) |
| `src/repositories/projectRepository.test.ts` | findByUserId/countTodayGenerations/insertProjectApis/getProjectApiIds/findBySlug/updateSuggestedSlugs/updateSlug |
| `src/repositories/userRepository.test.ts` | createWithAuthId/findByEmail(PGRST116 null) |
| `src/repositories/supabaseRateLimitRepository.test.ts` | 4개 RPC 메서드 성공·실패 |
| `src/repositories/supabaseUserApiKeyRepository.test.ts` | upsert/delete/findByUserAndApi(PGRST116)/findAllByUser/updateVerificationStatus(true→ISO/false→null) |
| `src/repositories/factory.test.ts` | 7개 팩토리 함수 × postgres(Drizzle)/supabase(SupabaseClient)/supabase(클라이언트 없음→에러) 분기 |

#### 유틸리티

| 파일 | 검증 항목 |
|------|----------|
| `src/__tests__/repositories/catalogRepository.test.ts` | `toDomain` JSONB 매퍼, `parseEndpoints` snake_case↔camelCase 이중 처리 |
| `src/__tests__/repositories/codeRepository.test.ts` | `countByProject`, `pruneOldVersions`, `getNextVersion` |
| `src/__tests__/repositories/eventRepository.test.ts` | `persist`/`persistAsync`/`findByUser` limit 100 cap |
| `src/repositories/utils/conditionBuilder.test.ts` | `buildConditions()` — undefined/빈 객체/단일·복수 조건 |

---

### 2.5 API Route 통합 테스트 (11파일, ~110개)

`pnpm test:integration`으로 실행 (대상: `src/app/api/**`)

> **공통 검증 패턴**: 인증 없음(401) → 잘못된 입력(400) → 타인 리소스(403) → 비즈니스 규칙(422/429) → 성공 응답

#### 코드 생성 관련

| 파일 | 엔드포인트 | 주요 검증 항목 |
|------|-----------|---------------|
| `generate.test.ts` | `POST /api/v1/generate` | SSE 스트리밍 포맷, 레이트리밋 429 SSE 에러, AI 실패 시 `decrementDailyLimit` 보상, `templateId` 전달 |

#### 보안 관련

| 파일 | 엔드포인트 | 주요 검증 항목 |
|------|-----------|---------------|
| `proxy.test.ts` | `GET /api/v1/proxy` | **SSRF 방지**: loopback/RFC1918/AWS 메타데이터/IPv6(`[::1]`/`[fe80::1]`) 6종 차단, 분당 60회 rate limit, upstream 타임아웃 502 |
| `admin.test.ts` | 관리자 API | Bearer 토큰 인증, IP 스푸핑 방지, CORS 헤더, QC rate limit |

#### 배포·게시·관리

| 파일 | 엔드포인트 | 주요 검증 항목 |
|------|-----------|---------------|
| `deploy.test.ts` | `POST /api/v1/deploy` | SSE progress 이벤트 순서(10%→100%), 일일 배포 rate limit, 플랫폼 유효성 |
| `preview.test.ts` | `GET /api/v1/preview/[id]` | HTML 응답 + CSP 헤더, `version` 쿼리 파라미터 |
| `projects-publish.test.ts` | `POST/DELETE /api/v1/projects/[id]/publish` | slug 전달, QC 경고, 게시 취소 |
| `projects-rollback.test.ts` | `POST /api/v1/projects/[id]/rollback` | version 유효성, 롤백 성공 + 이벤트 |
| `projects-slug-check.test.ts` | `POST /api/v1/projects/[id]/slug/check` | 예약어(`api`/`admin`/`www`) 차단, 자기 slug 재사용 허용 |
| `health.test.ts` | `GET /api/v1/health` | `healthy`/`degraded`/`unhealthy`, `usage` 필드 |

#### AI 추천 관련

| 파일 | 엔드포인트 | 주요 검증 항목 |
|------|-----------|---------------|
| `suggest-apis.test.ts` | `POST /api/v1/suggest-apis` | context 길이(50~2000자), 파싱 실패 시 빈 배열 |
| `suggest-context.test.ts` | `POST /api/v1/suggest-context` | apis 배열 최대 5개, AI 응답 JSON 파싱 |

---

### 2.6 컴포넌트 테스트 (2파일, ~10개)

`src/**/*.test.tsx` — happy-dom 환경

| 파일 | 검증 항목 |
|------|----------|
| `src/components/dashboard/PublishDialog.test.tsx` | AI 추천 slug 라디오, 커스텀 slug 입력, slug 가용성 체크 후 버튼 활성화 |
| `src/components/dashboard/RePromptSection.test.tsx` | 버전 번호 표시, `router.refresh()` 호출 |

---

### 2.7 E2E 테스트 — Playwright (3파일, ~11개 × 3디바이스)

`pnpm test:e2e`로 실행

**대상 디바이스:** mobile(iPhone 14), tablet(iPad Mini), desktop(Desktop Chrome)

| 파일 | 검증 항목 |
|------|----------|
| `e2e/health.spec.ts` | `GET /api/v1/health` → 200, `GET /api/v1/catalog` → 200 |
| `e2e/pages/landing.spec.ts` | 페이지 로드, 헤더·푸터, CTA 버튼, 가로 스크롤 없음, 콘솔 에러 없음 |
| `e2e/pages/catalog.spec.ts` | API 카드 렌더링(최소 1개), 가로 스크롤 없음 |

> E2E는 반응형 레이아웃 회귀 검증에 초점. AI 기능은 단위·통합 계층에서 검증.

---

## 3. 모킹 전략

### 외부 HTTP API — MSW

```typescript
// src/test/mocks/handlers.ts
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
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('@/services/factory', () => ({
  createProjectService: vi.fn(),
}));
```

### API Route 모듈 격리 — vi.resetModules

```typescript
beforeEach(async () => {
  vi.resetModules();
  const { POST } = await import('@/app/api/v1/generate/route');
});
```

### global fetch 모킹 (proxy, githubService, railwayService 테스트)

```typescript
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
afterEach(() => { vi.unstubAllGlobals(); });
```

### Drizzle ORM mock 패턴

```typescript
function makeMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    // ...
  };
}
```

### Supabase 체인 mock 패턴

```typescript
// single() 로 끝나는 체인
const chain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: row, error: null }),
};
const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
```

### 싱글톤 캐시 초기화

```typescript
AiProviderFactory.clearCache();
_resetProviderCache();
(DeployProviderFactory as unknown as { providers: Map<string, unknown> })['providers'] = new Map();
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

GitHub Actions (`.github/workflows/ci.yml`) 실행 순서:

```
push/PR
  ↓
lint (ESLint)
  ↓
type-check (tsc --noEmit)
  ↓
test (pnpm test — 1,078개)
  ↓
커버리지 업로드 (Codecov + SonarCloud)
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

**현재 달성값** (로컬 기준):

| 지표 | 달성값 |
|------|--------|
| lines | **71.77%** |
| statements | **70.76%** |
| branches | **67.18%** |
| functions | **65.79%** |

**CI 임계값** (미달 시 CI 실패):

| 지표 | 임계값 |
|------|--------|
| branches | 40% |
| functions | 30% |
| lines | 45% |
| statements | 43% |

커버리지 외부 연동: **Codecov** + **SonarCloud** (PR마다 자동 스캔)

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

### vi.mock factory 안에서 top-level 변수 참조 금지

```typescript
// ❌ hoisting으로 인해 undefined
const mockFn = vi.fn();
vi.mock('@/lib/foo', () => ({ fn: mockFn }));

// ✅ 올바른 예
vi.mock('@/lib/foo', () => ({ fn: vi.fn() }));
```

### 모듈 레벨 상태를 가진 파일 테스트 (eventPersister 패턴)

```typescript
// 모듈 레벨 변수(registered 등)를 테스트 간 초기화하려면:
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
});
const { registerEventPersister } = await import('./eventPersister');
```

### 코드 생성 품질 채점 기준

| 점수 | 기준 |
|------|------|
| 5 | 코드 복사 → 바로 동작, 디자인 우수, 에러 처리 완벽 |
| 4 | 경미한 수정으로 동작, 디자인 양호 |
| 3 | 일부 수정 필요하지만 구조는 올바름 |
| 2 | 상당한 수정 필요, 일부 기능 누락 |
| 1 | 동작하지 않거나 요청과 무관한 결과 |

**최소 합격 기준: 평균 3.5점 이상**
