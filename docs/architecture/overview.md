# 시스템 아키텍처

> **언제 읽나**: 새 레이어·Provider를 추가하거나 `src/` 디렉터리 구조를 바꿀 때. Route→Service→Repository 책임 경계와 "어느 관심사가 어느 디렉터리에 사는가"를 확인한다

> **최종 업데이트:** 2026-08-07
> **구현 상태:** 운영 중 (임베디드 SQLite · Auth.js Credentials 다중 사용자 · 게시=`slug` 서브도메인). 테스트 개수/%는 [test-coverage-map](../reference/test-coverage-map.md)·`pnpm test`로 확인 (이 문서에 고정 수치 없음)

> **이 문서의 역할:** **지도**다 — "무엇이 어디 있는가"만 적는다. *어떻게 동작하는가*는 전문 문서가 소유한다:
> [system-spec.md](system-spec.md)(불변조건) · [database.md](database.md)(스키마·타입 매핑·부팅 시드) ·
> [auth.md](auth.md)(인증 흐름) · [ai-pipeline.md](ai-pipeline.md)(생성 파이프라인) ·
> [events.md](events.md)(이벤트 타입·EventBus) · [subdomain.md](subdomain.md)(게시·서브도메인).
>
> **파일 목록·개수·인터페이스 본문은 여기에 두지 않는다.** 소스가 더 정확하고 복제본은 조용히 썩는다 —
> 2026-08-07 실측에서 이 문서가 갖고 있던 디렉터리 트리는 **존재하지 않는 심볼 5개**(`StepRegistry.ts` ·
> `useApiCatalog.ts` · `useProjects.ts` · `useGeneration.ts` · `GenerationService`)를 가리키고 있었고,
> 프록시 인가 단일 진입점이 사는 `src/lib/proxy/`는 **통째로 빠져 있었다.** 트리를 되살리지 말 것.

---

## 1. 전체 아키텍처 개요

```
┌────────────────────────────────────────────────────────────────┐
│                       사용자 브라우저                             │
└───────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                   Presentation Layer                           │
│                   (React / Next.js App Router)                 │
│                                                                │
│   Pages ─→ Components ─→ Custom Hooks ─→ Stores (Zustand)     │
│                                                                │
│   ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌─────────────┐  │
│   │ 카탈로그    │ │ 빌더        │ │ 대시보드  │ │ 랜딩/인증    │  │
│   │ 페이지     │ │ 페이지      │ │ 페이지   │ │ 페이지      │  │
│   └────────────┘ └────────────┘ └──────────┘ └─────────────┘  │
│          호스팅: Railway (Pro 플랜)                              │
└───────────────────────────┬────────────────────────────────────┘
                            │ /api/v1/*
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                   API Layer (Next.js Route Handlers)           │
│                   (요청 검증 + 인증 + 라우팅만 담당)               │
│                                                                │
│   Controller 클래스는 없다 — 경로별 route.ts 가 핸들러다          │
│   전체 목록·계약 → docs/reference/api-endpoints.md              │
│   (외부 deploy/* 제거 — 제품 배포 = publish → slug.xzawed.xyz)   │
└───────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                   Service Layer (비즈니스 로직)                   │
│                                                                │
│   CatalogService  ProjectService  RateLimitService  AuthService│
│                                                                │
│   (인증 = src/lib/auth/, 생성 오케스트레이션 = generationPipeline │
│    — 둘 다 서비스 클래스가 아니다)                                │
│                                                                │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ EventBus (도메인 이벤트 발행/구독) → §5                    │  │
│   └─────────────────────────────────────────────────────────┘  │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ FeatureConfig (설정 기반 비즈니스 규칙) → §6               │  │
│   └─────────────────────────────────────────────────────────┘  │
└────────┬──────────────────┬────────────────────────────────────┘
         │                  │
         ▼                  ▼
┌───────────────────┐  ┌───────────────────┐
│  Repository 계층   │  │  Provider 계층     │
│                   │  │                   │
│  interfaces/(seam)│  │  IAiProvider      │
│  + sqlite/(유일)   │  │  → ClaudeProvider │
│        ↓          │  │  + Factory        │
│  SQLite (WAL)     │  │                   │
└───────────────────┘  └───────────────────┘
```

> **데이터 계층 (2026-06-23 컷오버):** 임베디드 **SQLite**(`better-sqlite3` + `drizzle-orm/better-sqlite3`, WAL 모드),
> Railway 영속 볼륨(`/data/app.db`)에 단일 파일, **단일 인스턴스** 전제. Supabase·PostgreSQL·RLS는 제거됨.
> **스키마·pg→sqlite 타입 매핑·부팅 시드 순서(`bootstrapSqlite`)·Repository 구현 목록은 전부
> [database.md](database.md)가 소유한다** — 여기에 복제하지 않는다.
> 컷오버 배경: [decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md](../decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md)

---

## 2. 레이어 책임 정의

| 레이어 | 책임 | 하지 않는 것 |
|--------|------|-------------|
| **Presentation** | UI 렌더링, 사용자 입력 처리, 상태 표시 | DB 접근, 비즈니스 로직 |
| **API (Route Handler)** | 요청 파싱, 인증 확인, 입력 검증(Zod), 응답 포맷팅 | 비즈니스 로직, DB 접근 |
| **Service** | 비즈니스 로직, 유효성 검증, 이벤트 발행, 트랜잭션 관리 | DB 직접 접근, UI 관련 |
| **Repository** | 데이터 CRUD, 쿼리 구성, 도메인 모델 변환 | 비즈니스 규칙 판단 |
| **Provider** | 외부 서비스 연동 추상화 (현재 **AI 하나뿐** — Deploy·GitHub는 2026-08-01 제거) | 비즈니스 로직 |
| **Test** | lib/ai, services, providers 단위 테스트 + API 통합 테스트 (Vitest + MSW) | 프로덕션 코드 포함 금지 |

---

## 3. 디렉터리 지도 — 관심사가 사는 곳

**파일 목록은 이 문서가 아니라 저장소에서 확인한다** (`git ls-files src` 또는 glob).
불변조건의 **소유자**는 루트 `CLAUDE.md`의 「모듈 지도」가 소유하므로 여기서 반복하지 않는다.

| 디렉터리 | 사는 것 | 상세 |
|---|---|---|
| `src/app/` | App Router 페이지 + `/api/v1/*` route handler | [api-endpoints.md](../reference/api-endpoints.md) |
| `src/components/` · `src/hooks/` · `src/stores/` | Presentation 전용 (UI · 관심사별 분리 Zustand 스토어) | — |
| `src/services/` | Service Layer + 팩토리 함수 | — |
| `src/repositories/` | `interfaces/`(seam) · `sqlite/`(유일 구현) · 무인자 `factory.ts` | [database.md §6](database.md) |
| `src/providers/ai/` | `IAiProvider` 계약 · `ClaudeProvider` · `AiProviderFactory` | [ai-pipeline.md §6](ai-pipeline.md) |
| `src/lib/ai/` | 생성 파이프라인 전체 (오케스트레이터·스테이지·QC 루프·프롬프트) | [ai-pipeline.md §9](ai-pipeline.md) |
| `src/lib/auth/` | Auth.js edge/node 분할 설정 · 토큰 · 소유권 · 이메일 게이트 · 레이트리밋 | [auth.md](auth.md) |
| `src/lib/proxy/` | `resolveProxyContext`(인가 단일 진입점) · `siteRateLimit` | [system-spec §1.3·§4.1](system-spec.md) |
| `src/lib/cache/` | `proxyCache` — 캐시 키에 **키 신원 필수**(교차 테넌트 유출) | [system-spec §1.1](system-spec.md) |
| `src/lib/db/sqlite/` | 연결(pragma) · 스키마 · 부팅 부트스트랩 · 시드 | [database.md §4](database.md) |
| `src/lib/events/` | `eventBus` · `eventPersister` | [events.md](events.md) |
| `src/lib/monitoring/` | Slack 싱크 · 에러율 모니터 | [system-spec §4.4](system-spec.md) |
| `src/lib/catalog/` | 헬스 판정 · 키 검증 · 활성 개수 동적 카운트 | [ADR](../decisions/2026-06-21-api-catalog-health-monitoring.md) |
| `src/lib/qc/` | 렌더링 QC · Playwright 브라우저 풀 | [qc-process.md](../guides/qc-process.md) |
| `src/lib/config/` | env 기반 설정 (§6) | [env-vars.md](../reference/env-vars.md) |
| `src/lib/constants/` | CSP CDN 화이트리스트 단일 출처 | [system-spec §4.3](system-spec.md) |
| `src/templates/` | 코드 생성 템플릿 + `TemplateRegistry` | [ai-pipeline.md §7](ai-pipeline.md) |
| `src/data/` | 부팅 시드 JSON (프로덕션 미러 — 손편집 금지) | [database.md §4](database.md) |
| `src/__tests__/` · `src/test/` | API 통합 테스트 + MSW 목 | [test-coverage-map.md](../reference/test-coverage-map.md) |
| `src/middleware.ts` | 서브도메인 rewrite · CSP/HSTS · 인증 게이트 — **Edge runtime** | [subdomain.md](subdomain.md) · [system-spec §4.2·§4.3](system-spec.md) |
| `src/instrumentation.ts` | 부팅 훅 — `bootstrapSqlite` · 구독자 등록 | [database.md §4](database.md) |

**디렉터리 이름이 거짓말하는 지점** (트리만 봐서는 틀리는 것):

- **인증과 생성 오케스트레이션은 `src/services/`에 없다.** 인증은 `src/lib/auth/`, 생성은
  `src/lib/ai/generationPipeline.ts`다 — 둘 다 서비스 클래스가 아니라 `services/`를 뒤지면 못 찾는다.
- **`src/components/ui/`는 shadcn/ui가 아니다** — Tailwind CSS 직접 구현이다.
- **`src/repositories/sqlite/`가 유일 구현이다.** `interfaces/`는 seam으로만 남고 DB provider 분기는 없다.
- **`providers/deploy/`·`lib/deploy/`는 존재하지 않는다** (2026-08-01 제거 — §4.2).

---

## 4. Provider 계층

### 4.1 AI Provider

**계약 본문의 유일 진실원은 [`src/providers/ai/IAiProvider.ts`](../../src/providers/ai/IAiProvider.ts)** 다
(`AiPrompt` · `AiResponse` · `AiStreamResult` · `IAiProvider`). 여기에 복제하지 않는다.

- `tokensUsed`는 `{ input, output }` 구조다 — `inputTokens`/`outputTokens`가 아니다(자주 틀리는 지점이라 루트 `CLAUDE.md`에도 고정돼 있다)
- 태스크별 모델 선택·허용목록·조용한 폴백: [ai-pipeline.md §6](ai-pipeline.md) · [system-spec §3.4·§3.5](system-spec.md)
- AI 호출 타임아웃에 `AbortSignal`이 필요한 이유(이중 청구): [system-spec §3.3](system-spec.md)

**확장 방법** — 새 AI 제공자 추가 시
1. `IAiProvider`를 구현하는 새 클래스 생성
2. `AiProviderFactory`에 등록 (`createForTask()`가 태스크별 모델을 고르고 인스턴스를 캐싱한다)
3. 환경변수 또는 DB 설정으로 활성화

### 4.2 Deploy Provider — 제거됨 (2026-08-01)

외부 GitHub/Railway export 스택(`IDeployProvider`, `RailwayDeployer`, `GithubPagesDeployer`)은 제거됐다.
제품 배포는 **게시 → 서브도메인** (`projectService.publish` / `middleware` rewrite).
배경: [ADR 2026-08-01-remove-external-deploy-stack](../decisions/2026-08-01-remove-external-deploy-stack.md)

### 4.3 Code Template

계약 본문은 [`src/templates/ICodeTemplate.ts`](../../src/templates/ICodeTemplate.ts)
(`TemplateContext` · `TemplateOutput` · `ICodeTemplate` — `matchScore`는 0~1 적합도).
등록된 템플릿 목록·레이아웃 매핑·`promptHint` 주입 흐름은 [ai-pipeline.md §7](ai-pipeline.md)이 소유한다.

---

## 5. 이벤트 시스템

`DomainEvent` 유니온 · `EventBus` 구현 · 구독 예시는 **[events.md](events.md)** 가 소유한다
(타입 원본은 `src/types/events.ts`). 삭제 이벤트의 payload 키 함정(`deletedProjectId`/`deletedUserId`)은
[system-spec §2.3](system-spec.md), 감사 로그 익명화는 [system-spec §2.4](system-spec.md).

**발행 지점 (현재 운영 중):**

| 이벤트 | 발행 위치 |
|--------|----------|
| `USER_SIGNED_UP` | `api/v1/auth/signup/route.ts` — 가입 성공 직후. **서비스가 아니라 라우트가 발행한다**(`USER_DELETED`와 같은 자리) |
| `USER_DELETED` | `DELETE /api/v1/auth/account` — 계정 삭제 커밋 **이후** |
| `PROJECT_CREATED` / `PROJECT_DELETED` / `PROJECT_PUBLISHED` / `PROJECT_UNPUBLISHED` | `projectService.ts` |
| `CODE_GENERATED` | `generationSaver.ts` |
| `CODE_GENERATION_FAILED` | `generationPipeline.ts` (`handlePipelineFailure`) |
| `API_QUOTA_WARNING` | `rateLimitService.ts` — 일일 한도 80% 도달 시 (fire-and-forget) |
| `QC_REPORT_COMPLETED` / `QC_REPORT_FAILED` | `generationPipeline.ts` |
| `STAGE2_FALLBACK_USED` / `STAGE3_FALLBACK_USED` / `STAGE_SKIPPED` / `QUALITY_LOOP_COMPLETED` | `generationPipeline.ts` · `qualityLoop.ts` — [events.md](events.md) 참조 |

> **확장은 구독자 추가로 한다** — `eventBus.on(handler)` 하나면 핵심 로직 수정 없이 알림·분석을 붙일 수 있다.
> 부팅 시 `registerEventPersister()`가 1회 등록되면 이후 모든 `emit()`이 `platform_events`에
> 자동 기록되므로 라우트에서 `persistAsync`를 따로 부르지 않는다.

---

## 6. 설정 기반 비즈니스 규칙

`FeatureLimits`(프로젝트당 API 수 · 일일 생성/추천 쿼터 · 프로젝트 수 · 재생성 · 코드 버전 수 · 컨텍스트 길이)를
**환경변수로 조절**한다 — 코드 수정 없이 한도를 바꾸기 위한 seam이다.

- 구현: [`src/lib/config/features.ts`](../../src/lib/config/features.ts) (`DEFAULT_LIMITS` · `getLimits(plan)`)
- **기본값과 환경변수 이름의 진실원은 [env-vars.md](../reference/env-vars.md)** — 숫자를 여기에 복제하지 않는다(복제하는 순간 한쪽이 썩는다)
- ⚠️ `PLAN_OVERRIDES`의 `pro` 플랜은 **현재 도달하지 않는다.** 호출부가 전부 인자 없는 `getLimits()`라 항상 `free`가 적용된다(2026-08-07 코드 확인). 유료 플랜을 켜려면 호출부에 plan을 넘기는 작업이 선행된다

---

## 7. 데이터 흐름 예시 (레이어 통과)

### 코드 생성 요청 흐름

```
[사용자: "생성하기" 클릭]
    │
    ▼
[Presentation] builder 페이지 → SSE 구독 (탭 백그라운드 시 폴링 fallback)
    │
    ▼ POST /api/v1/generate
[API Layer] route.ts
    ├── 세션 인증 + assertEmailVerified
    ├── 입력 검증 (Zod) + 일일 한도 test-and-set
    └── 생성 락 획득 (실패 시 409)
    │
    ▼
[오케스트레이터] src/lib/ai/generationPipeline.ts   ← 서비스 클래스가 아니다
    (Stage 0~3 · 정적/Playwright QC · Quality Loop — 실제 단계는 ai-pipeline.md §9)
    │
    ├─▶ [Repository] SQLite (better-sqlite3, 동기 API) 조회·저장
    ├─▶ [Provider]   AiProviderFactory → ClaudeProvider → Claude API
    └─▶ [EventBus]   CODE_GENERATED / CODE_GENERATION_FAILED → platform_events
```

> **`GenerationService`라는 클래스는 없다** — 이 문서가 2026-08-07까지 그렇게 적고 있었다.
> 오케스트레이션은 `generationPipeline.ts`이고 generate/regenerate가 이 진입점을 공유한다.
> 중복 생성 차단이 DB 락 전담인 이유는 [system-spec §3.1](system-spec.md).

### 인증 흐름

회원가입 · 로그인(스로틀 포함) · 이메일 인증 · 비밀번호 재설정 · Edge 분할 · 미들웨어 게이팅은
**[auth.md](auth.md)** 가 소유한다.

> **핵심**: 공개 셀프서비스 회원가입 + **계정별 완전 데이터 격리** 모델이다.
> Auth.js v5 Credentials + **무상태 JWT**(`AUTH_SECRET` 서명, DB 세션 어댑터 없음), 비밀번호는
> 사용자별 `scrypt` 해시. OAuth·Supabase Auth·env 단일 관리자(`ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`)·
> `seedAdminUser`는 제거됨 — 신규 환경은 `/signup`으로 첫 사용자를 생성한다.
> 세션은 무상태라 삭제된 계정의 토큰이 유령 세션이 될 수 있고, 그래서 `getAuthUser`가 DB 행을
> 확인한다 — [system-spec §1.2](system-spec.md).

---

## 8. 확장 시나리오별 수정 범위

| 확장 시나리오 | 수정 필요한 레이어 | 수정 범위 |
|-------------|------------------|----------|
| 새 AI 제공자 추가 (OpenAI, Ollama) | Provider만 | 새 클래스 1개 + Factory 등록 |
| 제품 "배포" 변경 | 게시·서브도메인 경로 | 외부 export 스택은 **제거됨**(2026-08-01). 제품 배포 = `publish` → `slug.xzawed.xyz` |
| 새 API 카테고리 추가 | 카탈로그 시드 데이터만 | `src/data/apiCatalog.json` 항목 추가 + 필요 시 `STRUCTURAL_PATCH_IDS` ([database.md §4](database.md)) |
| 새 빌더 단계·모드 추가 | `src/components/builder/` + 스토어 | 컴포넌트 추가 (스텝 레지스트리 방식 아님 — 아래 참고) |
| 웹훅 알림 | EventBus 구독자 | 이벤트 핸들러 추가 (핵심 로직 무수정) |
| 모바일 앱 | API 레이어 재사용 | 별도 앱, API 공유 |

> **다국어(i18n)는 확장 시나리오가 아니다** — 계획 없음으로 종결됐다(루트 `CLAUDE.md` 상시 결정 절).
> `@/lib/i18n`은 한국어 메시지 단일 출처로만 쓴다.

> **참고:** 멀티 테넌시(organizations)·팀 협업·갤러리·좋아요 기능은 **제거됨**. 조직·역할 개념 없이
> **평등한 개인 계정** 구조다. 일부 테이블에 `organization_*` 컬럼이 스키마상 잔존하나 항상 `null`이며
> 어떤 기능도 사용하지 않는다 — 상세는 [database.md §1](database.md).
