# 테스트 전략·검증 항목 가이드

> **언제 읽나**: 새 테스트를 추가하거나 `vitest.config.ts`·`src/test/setup.ts`·MSW 핸들러·happy-dom 설정을 손댈 때. `coverage.include` 누락은 CI를 빨갛게 만든다

> 이 문서는 CustomWebService의 테스트 구조, 모킹 전략, 실행 방법, 에이전트 함정을 설명한다.
> 스택 진실원: 루트 [`CLAUDE.md`](../../CLAUDE.md) · [`docs/architecture/system-spec.md`](../architecture/system-spec.md).
> 커버 범위·공백 지도: [`docs/reference/test-coverage-map.md`](../reference/test-coverage-map.md).
>
> **이 문서는 테스트 개수·커버리지 %를 고정 수치로 적지 않는다.** 수치는 날짜가 지나면 거짓이 된다. 목록·통과 여부는 아래 명령으로 직접 확인한다.

---

## 1. 테스트 전략 개요

### 피라미드 (개념)

```
             ┌─────────┐
             │   E2E   │  Playwright (`e2e/`)
            ─┼─────────┼─
           │ 컴포넌트  │  React + happy-dom (`*.test.tsx`)
          ──┼──────────┼──
         │    통합     │  API routes (Vitest + MSW)
        ────┼──────────┼────
       │       단위    │  lib · providers · services · repositories
       ──────────────────
```

확인 명령:

```bash
pnpm exec vitest list
pnpm exec playwright test --list
pnpm test                 # 통과 여부 진실원
pnpm test:e2e             # E2E (실 백엔드 env 필요)
```

### 핵심 원칙

1. **외부 서비스는 항상 Mock** — Claude API 등 외부 HTTP는 MSW 또는 `vi.stubGlobal('fetch')`. 실키·실네트워크에 의존하지 않는다.
2. **모듈 격리** — API route 테스트는 `vi.resetModules()` + dynamic import로 모듈 레벨 사이드이펙트를 격리한다.
3. **보안 검증 필수** — SSRF, XSS, 코드 인젝션, 소유권·이메일 게이트는 단위/통합 양쪽에서 검증한다.
4. **레이트리밋 경계값** — 429, fail-open/fail-closed 정책, 환불(`charged===true`) 등 엣지케이스를 명시한다.
5. **삭제된 스택을 모킹하지 말 것** — `@/lib/supabase/server`, Drizzle postgres 경로, `BaseRepository`, `failover` 모듈은 **존재하지 않는다**. 잔존 mock은 미존재 모듈 모킹이다.

### 프레임워크

| 도구 | 용도 |
|------|------|
| [Vitest](https://vitest.dev/) | 단위·통합 러너 (`vitest.config.ts`) |
| happy-dom | 컴포넌트 테스트 DOM |
| MSW | 외부 HTTP 모킹 (기본 Anthropic) |
| Playwright | E2E (`e2e/`, `@playwright/test`) |

스택: **임베디드 SQLite 단일 백엔드** (better-sqlite3). Repository 테스트는 `Sqlite*` 구현체 + `:memory:` DB를 쓴다.

---

## 2. 분류와 실행 스코프

`package.json` 기준 (이 값이 정본이다):

| 스크립트 | 대상 | 용도 |
|----------|------|------|
| `pnpm test` | `src/**/*.test.ts(x)` (e2e 제외) | 전체 Vitest |
| `pnpm test:unit` | `src/lib` · `src/providers` · `src/services` · `src/repositories` | 단위 (서비스·레포 **포함**) |
| `pnpm test:integration` | `src/__tests__/api` · `src/app/api` | API 라우트 통합 |
| `pnpm test:coverage` | 전체 + v8 커버리지 | CI·로컬 리포트 |
| `pnpm test:e2e` | `e2e/` | Playwright |
| `pnpm test:e2e:ui` | `e2e/` | UI 모드 |
| `pnpm test:prod` | standalone 빌드 + health | 프로덕션 스모크 |
| `pnpm test:watch` | Vitest watch | 로컬 반복 |

### 2.1 단위 — lib / providers / services / repositories

**위치**: 소스 옆 co-located `*.test.ts` 또는 `src/__tests__/lib` 등.

대표 영역 (파일명은 예시 — 존재 여부는 디스크 기준):

| 영역 | 검증 초점 |
|------|-----------|
| `src/lib/ai/*` | 파이프라인, stageRunner, qualityLoop, codeValidator, codeParser, generationTracker, generationLock |
| `src/lib/qc/*` | renderingQc, deepQcRunner, browserPool |
| `src/lib/auth/*` | authorize, verifiedGuard, rateLimit, password, tokens |
| `src/lib/proxy/*` · `src/lib/cache/*` | 프록시 인가 컨텍스트, site 한도, 캐시 키 신원 |
| `src/lib/db/*` | SQLite connection/bootstrap/backup/retention, `isUniqueViolation` (SQLite 제약 + 레거시 23505 폴백) |
| `src/lib/events/*` | EventBus, eventPersister 멱등 등록 |
| `src/lib/monitoring/*` | slackAlert, errorRateMonitor |
| `src/providers/ai/*` | ClaudeProvider, AiProviderFactory (모델 허용목록·태스크 기본값) |
| `src/services/*` | project/catalog/rateLimit 등 비즈니스 규칙 |
| `src/repositories/sqlite/*` | **유일** 구현 9종: User, Project, Code, Catalog, UserApiKey, RateLimit, Event, AuthToken, **GenerationLock** |

> 외부 deploy 스택(`src/lib/deploy/**`, deployService 등)은 2026-08-01 제거. 관련 테스트도 없다.

### 2.2 API 라우트 통합

**위치**: 주로 `src/__tests__/api/` (대상 핸들러는 `src/app/api/**`). 일부 co-located `src/app/api/**/*.test.ts`도 존재할 수 있다.

공통 패턴: 인증 없음(401) → 잘못된 입력(400) → 타인 리소스(403) → 비즈니스 규칙(422/429) → 성공.

| 군 | 엔드포인트 예 | 주요 검증 |
|----|---------------|-----------|
| 생성 | `POST /generate`, `POST /generate/regenerate`, `GET /generate/status/:id` | SSE, 레이트리밋, 이메일 게이트, 소유권 |
| 프록시·보안 | `GET /proxy`, admin 진단 | SSRF, 캐시 키 신원, `ADMIN_API_KEY` |
| 게시 | `publish` / `rollback` / `slug/check` | slug, QC 경고, 롤백 |
| 추천 | `suggest-apis` · `suggest-context` · `suggest-preferences` · `suggest-modification` | 입력 한도, AI 파싱, 쿼터, 이메일 게이트 |
| 헬스 | `GET /health` | 공개 `ok` / 상세 `healthy`·`degraded`(AI)·`unhealthy`(DB) / 관리자 429 |

### 2.3 컴포넌트

`src/**/*.test.tsx` — happy-dom. 빌더·대시보드·설정·레이아웃 회귀 방지.

### 2.4 E2E — Playwright

`pnpm test:e2e`. 디렉터리 `e2e/`:

| 경로 | 초점 |
|------|------|
| `e2e/health.spec.ts` | health·catalog 스모크 |
| `e2e/pages/*` | 랜딩·카탈로그 반응형 |
| `e2e/serving/*` | CSP, 서브도메인 패스스루, 서빙 동치, 유령 세션 |
| `e2e/auth.setup.ts` | 인증 셋업 |

실 백엔드·env가 필요하다. CI 게이트 설정은 `.github/workflows`를 본다.

---

## 3. 모킹 전략

### 외부 HTTP — MSW

```typescript
// src/test/mocks/handlers.ts
http.post('https://api.anthropic.com/v1/messages', () => {
  return HttpResponse.json({
    content: [{ type: 'text', text: '```html\n...\n```' }],
    model: 'claude-opus-5',
    usage: { input_tokens: 100, output_tokens: 500 },
  });
});
```

`src/test/setup.ts`에서 `server.listen({ onUnhandledRequest: 'error' })` / `resetHandlers` / `close`.

### 내부 모듈 — vi.mock (현행)

```typescript
// ✅ 존재하는 모듈만
vi.mock('@/services/factory', () => ({
  createProjectService: vi.fn(),
}));

vi.mock('@/repositories/factory', () => ({
  createUserRepository: vi.fn(),
  createProjectRepository: vi.fn(),
  // ...
}));

// ❌ 삭제됨 — 쓰지 말 것
// vi.mock('@/lib/supabase/server', ...)
// vi.mock('@/lib/db/failover', ...)
```

### API Route 모듈 격리

```typescript
beforeEach(async () => {
  vi.resetModules();
  const { POST } = await import('@/app/api/v1/generate/route');
});
```

### global fetch (proxy 등)

```typescript
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
afterEach(() => { vi.unstubAllGlobals(); });
```

### SQLite / better-sqlite3

레포 단위 테스트는 인메모리 DB 또는 주입된 mock statement 체인을 사용한다. 과거 Drizzle postgres / Supabase 체인 mock 문서는 **폐기** — 새 테스트에 복사하지 말 것.

### 타이머 — vi.useFakeTimers

```typescript
it('TTL 후 자동 제거', async () => {
  vi.useFakeTimers();
  const { generationTracker, stopCleanup } = await import('./generationTracker');
  generationTracker.start('proj', 'user');
  vi.advanceTimersByTime(31 * 60 * 1000);
  expect(generationTracker.get('proj')).toBeUndefined();
  stopCleanup();
});

afterEach(() => {
  vi.useRealTimers();
});
```

`stopCleanup()` 누락 시 다음 테스트 오염.

### 싱글톤 캐시

```typescript
AiProviderFactory.clearCache();
```

---

## 4. CI 연동

GitHub Actions 전형 순서:

```
push/PR
  → lint
  → type-check
  → test:coverage (Codecov + SonarCloud)
  → build (standalone)
  → [PR] e2e
  → [main] Railway 배포
```

실패 시 이후 단계 진행 안 함. 상세 워크플로는 `.github/workflows/`.

---

## 5. 커버리지

- **화이트리스트**: `vitest.config.ts` → `coverage.include` (여기 없는 파일의 변경 라인은 Codecov patch / Sonar `new_coverage`에서 **0%**로 잡힌다).
- **CI 임계값** (`coverage.thresholds`): branches 40 · functions 30 · lines 45 · statements 43 — 미달 시 CI 실패.
- **SonarCloud vs Codecov**: Codecov/Vitest는 `coverage.include`만, SonarCloud는 `sonar.sources=src` 전체 — 숫자 불일치를 설정 오류로 단정하지 말 것.
- **공백·우선순위**: [test-coverage-map.md](../reference/test-coverage-map.md) (이 문서에 % 스냅샷을 다시 박지 말 것).

리포트 생성: `pnpm test:coverage` → `coverage/`.

---

## 6. 파일 위치 규칙

| 종류 | 위치 |
|------|------|
| 단위 | 소스 옆 `foo.test.ts` |
| API 통합 | `src/__tests__/api/` (권장) |
| 서비스·레포 보조 | `src/__tests__/services/`, `src/__tests__/repositories/` 등 |
| 컴포넌트 | `src/components/**/*.test.tsx` |
| E2E | `e2e/` |
| 헬퍼·MSW·setup | `src/test/` |

`vitest.config.ts` `include`: `src/**/*.test.ts`, `src/**/*.test.tsx` — `e2e/**` 제외.

---

## 7. 작성 함정 (검증된 것)

### happy-dom iframe

`vitest.config.ts` `environmentOptions.happyDOM.settings.navigation.disableChildFrameNavigation = true`.

- v20 `disableIframePageLoading`은 deprecated.
- `disableFallbackToSetURL` 기본 false 유지 — `iframe.src` 단언용.

### MSW `onUnhandledRequest: 'error'`

새 fetch 엔드포인트는 `src/test/mocks/handlers.ts`에 핸들러 필수.

**해소됨(2026-08-04, E7)**: 예전에는 MSW `'error'`가 비동기 전파상 테스트를 항상 빨갛게 만들지 못해 "전체 통과 ≠ 미처리 요청 부재"였다(MSW #946/#943). 지금은 `src/test/setup.ts`가 `onUnhandledRequest` **콜백으로 기록 + `afterEach` 단언**을 하므로 앱이 `.catch()`로 삼킨 요청도 테스트를 실패시킨다. **이 단언을 걷어내면 caveat가 되살아난다.**

### `coverage.include` 누락

라우트 테스트만 추가하고 include에 안 넣으면 patch 커버리지 0%. 비테스트 파일 제외는 `sonar.coverage.exclusions`와 `codecov.yml` **양쪽**.

### AiProviderFactory 모델 ID

`AiProviderFactory.ts` 허용목록·기본값 수정 시 **`.test.ts` 동시 갱신**. 날짜 suffix ID는 허용목록 밖 → 기본값 폴백.

### 모듈 레벨 플래그

`let registered = false` 류: `vi.resetModules()` + 매 테스트 `await import(...)`.

### 삭제된 mock 금지

| 금지 | 이유 |
|------|------|
| `vi.mock('@/lib/supabase/server')` | 모듈 삭제 (SQLite 컷오버) |
| `src/repositories/supabase/*` · `drizzle/*` · `base.ts` | 디렉터리/파일 없음 |
| `src/lib/db/failover.ts` | 없음 |
| `pnpm keys:verify` · `pnpm catalog:healthcheck` | 스크립트 삭제 — 런타임 admin 엔드포인트로 대체 |

### 필수 mock 조합 (AI 사용 시)

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
// ❌ hoisting → undefined
const mockFn = vi.fn();
vi.mock('@/lib/foo', () => ({ fn: mockFn }));

// ✅
vi.mock('@/lib/foo', () => ({ fn: vi.fn() }));
```

---

## 8. 생성물 품질 채점 (수동/에이전트 QC 참고)

| 점수 | 기준 |
|------|------|
| 5 | 복사 후 즉시 동작, 디자인·에러 처리 우수 |
| 4 | 경미한 수정, 디자인 양호 |
| 3 | 일부 수정 필요, 구조 올바름 |
| 2 | 상당한 수정, 기능 누락 |
| 1 | 미동작 또는 요청 무관 |

**최소 합격 기준(수동 채점): 평균 3.5 이상.** 자동 파이프라인 QC는 [qc-process.md](./qc-process.md).
