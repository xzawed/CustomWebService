# 시스템 아키텍처

> **언제 읽나**: 새 레이어·Provider를 추가하거나 `src/` 디렉터리 구조를 바꿀 때. `IAiProvider` 계약과 Route→Service→Repository 책임 경계를 확인한다

> **최종 업데이트:** 2026-08-01  
> **구현 상태:** 운영 중 (임베디드 SQLite · Auth.js Credentials 다중 사용자 · 게시=`slug` 서브도메인). 테스트 개수/%는 [test-coverage-map](../reference/test-coverage-map.md)·`pnpm test`로 확인 (이 문서에 고정 수치 없음)

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
│   │ 카탈로그    │ │ 빌더(Step) │ │ 대시보드  │ │ 랜딩/인증    │  │
│   │ 페이지     │ │ 동적 N-step│ │ 페이지   │ │ 페이지      │  │
│   └────────────┘ └────────────┘ └──────────┘ └─────────────┘  │
│          호스팅: Railway (Pro 플랜)                              │
└───────────────────────────┬────────────────────────────────────┘
                            │ /api/v1/*
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                   API Layer (Next.js API Routes)               │
│                   (요청 검증 + 인증 + 라우팅만 담당)               │
│                                                                │
│   /api/v1/catalog/*  → CatalogController                       │
│   /api/v1/projects/* → ProjectController                       │
│   /api/v1/generate/* → GenerationController                    │
│   /api/v1/health     → HealthController                        │
│   (외부 deploy/* 제거 — 제품 배포 = publish → slug.xzawed.xyz)   │
└───────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                   Service Layer (비즈니스 로직)                   │
│                                                                │
│   CatalogService   ProjectService   RateLimitService           │
│   (인증 = src/lib/auth/, 생성 오케스트레이션 = generationPipeline.ts │
│    — 서비스 클래스 아님)                                          │
│                                                                │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ EventBus (도메인 이벤트 발행/구독)                         │  │
│   │ PROJECT_CREATED, CODE_GENERATED, PROJECT_PUBLISHED ...  │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ FeatureConfig (설정 기반 비즈니스 규칙)                     │  │
│   │ maxApis, maxGenerations, contextLimits ...               │  │
│   └─────────────────────────────────────────────────────────┘  │
└────────┬──────────────────┬────────────────────────────────────┘
         │                  │
         ▼                  ▼
┌──────────────┐  ┌──────────────────┐
│  Repository  │  │  Provider 계층    │
│  Layer       │  │  (AI)            │
│              │  │                  │
│ UserRepo     │  │ ┌──────────────┐ │
│ ProjectRepo  │  │ │ IAiProvider  │ │
│ CatalogRepo  │  │ ├──────────────┤ │
│ CodeRepo     │  │ │ClaudeProvider│ │
│ EventRepo    │  │ │(확장 가능)   │ │
│ ApiKeyRepo   │  │ └──────────────┘ │
│ RateLimitRepo│  │                  │
│  ↓           │  │ + ProviderFactory│
│ SQLite       │  │                  │
│ (better-     │  └──────────────────┘  └──────────────────┘
│  sqlite3)    │
└──────────────┘
```

> **데이터 계층 (2026-06-23 컷오버):** 임베디드 **SQLite**(`better-sqlite3` + `drizzle-orm/better-sqlite3`, WAL 모드).
> Railway 영속 볼륨(`/data/app.db`)에 단일 파일로 저장하며 **단일 인스턴스** 전제. Supabase·PostgreSQL·RLS는 제거됨.
> Repository 구현체는 `src/repositories/sqlite/*` **9종**이 유일하며, 인터페이스(`src/repositories/interfaces`) seam만 추상화로 남는다.
> 타입 매핑(pg→sqlite): uuid→text, jsonb→text(JSON, drizzle 자동 역직렬화), boolean→integer, timestamptz→ISO text.
>
> **부팅 시퀀스:** `src/instrumentation.ts` → `bootstrapSqlite(getSqliteDb())` 가 ① 마이그레이션(`drizzle/sqlite`) ② 카탈로그/플래그 시드(`src/data/{apiCatalog,featureFlags}.json`)를 **멱등**으로 실행한다. `seedAdmin`은 제거됨 — 신규 환경은 `/signup`으로 첫 사용자를 생성한다. 컷오버 배경: [decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md](../decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md)

---

## 2. 레이어 책임 정의

| 레이어 | 책임 | 하지 않는 것 |
|--------|------|-------------|
| **Presentation** | UI 렌더링, 사용자 입력 처리, 상태 표시 | DB 접근, 비즈니스 로직 |
| **API (Controller)** | 요청 파싱, 인증 확인, 입력 검증(Zod), 응답 포맷팅 | 비즈니스 로직, DB 접근 |
| **Service** | 비즈니스 로직, 유효성 검증, 이벤트 발행, 트랜잭션 관리 | DB 직접 접근, UI 관련 |
| **Repository** | 데이터 CRUD, 쿼리 구성, 도메인 모델 변환 | 비즈니스 규칙 판단 |
| **Provider** | 외부 서비스 연동 추상화 (AI, Deploy, GitHub) | 비즈니스 로직 |
| **Test** | lib/ai, services, providers 단위 테스트 + API 통합 테스트 (Vitest + MSW) | 프로덕션 코드 포함 금지 |

---

## 3. 확장 가능한 디렉토리 구조

```
src/
├── app/                          # Next.js App Router (Presentation + API)
│   ├── (auth)/                   # 인증 페이지 그룹
│   │   ├── login/page.tsx        # 로그인 UI (Auth.js Credentials — 이메일/비밀번호)
│   │   ├── signup/page.tsx       # 회원가입 UI
│   │   ├── verify-email/page.tsx # 이메일 인증 완료 UI
│   │   ├── forgot-password/page.tsx # 비밀번호 찾기 UI
│   │   └── reset-password/page.tsx  # 비밀번호 재설정 UI
│   ├── (main)/                   # 메인 페이지 그룹
│   │   ├── catalog/page.tsx
│   │   ├── builder/page.tsx
│   │   ├── dashboard/page.tsx
│   │   └── preview/[id]/page.tsx
│   ├── api/v1/                   # API Routes (v1 버저닝 — 전체 목록은 docs/reference/api-endpoints.md 참조)
│   │   ├── catalog/
│   │   │   ├── route.ts          # GET /api/v1/catalog
│   │   │   ├── [id]/route.ts
│   │   │   └── categories/route.ts
│   │   ├── projects/
│   │   │   ├── route.ts          # GET, POST /api/v1/projects
│   │   │   └── [id]/
│   │   │       ├── route.ts      # GET, DELETE
│   │   │       ├── publish/route.ts   # POST, DELETE
│   │   │       ├── rollback/route.ts  # POST
│   │   │       └── slug/check/route.ts # POST
│   │   ├── generate/
│   │   │   ├── route.ts          # POST (SSE)
│   │   │   ├── regenerate/route.ts
│   │   │   └── status/[projectId]/route.ts  # GET (폴링 fallback)
│   │   ├── preview/
│   │   │   └── [projectId]/route.ts  # GET (text/html)
│   │   ├── proxy/route.ts        # GET (SSRF 방지 프록시)
│   │   ├── suggest-apis/route.ts
│   │   ├── suggest-context/route.ts
│   │   ├── suggest-preferences/route.ts
│   │   ├── suggest-modification/route.ts
│   │   ├── popular-services/route.ts
│   │   ├── user-api-keys/route.ts
│   │   │   ├── auth/             # /api/v1/auth/* — signup, verify-email, resend-verification, forgot-password, reset-password
│   │   ├── admin/            # 관리자 전용 (ADMIN_API_KEY 보호 — 사용자 인증과 무관)
│   │   │   ├── debug/route.ts
│   │   │   ├── keys-verify/route.ts    # GET — 플랫폼 키 검증 (로직: src/lib/catalog/keyCheck.ts)
│   │   │   ├── qc-stats/route.ts
│   │   │   ├── test-generation/route.ts
│   │   │   └── trigger-qc/route.ts # POST
│   │   └── health/route.ts       # GET
│   ├── layout.tsx
│   └── page.tsx                  # 랜딩 페이지
│
├── __tests__/                    # 통합 테스트
│   └── api/                      # API Route 통합 테스트 (31파일)
│       ├── health.test.ts
│       ├── catalog.test.ts
│       ├── projects.test.ts
│       ├── generate.test.ts
│       ├── preview.test.ts
│       ├── proxy.test.ts
│       ├── site.test.ts
│       ├── admin.test.ts
│       ├── admin-debug.test.ts
│       ├── admin-keys-verify.test.ts
│       ├── admin-test-generation.test.ts
│       ├── projects-publish.test.ts
│       ├── projects-rollback.test.ts
│       ├── projects-slug-check.test.ts
│       ├── suggest-apis.test.ts
│       ├── suggest-context.test.ts
│       ├── suggest-modification.test.ts
│       └── suggest-preferences.test.ts
│
├── test/                         # 테스트 유틸리티
│   ├── setup.ts                  # MSW 초기화
│   └── mocks/
│       ├── server.ts
│       └── handlers.ts           # Claude API 모킹
│
├── components/                   # UI 컴포넌트 (Presentation만)
│   ├── ui/                       # (shadcn/ui 미사용 — Tailwind CSS 직접 구현)
│   ├── layout/                   # Header, Footer, Navigation
│   ├── catalog/                  # API 카탈로그 UI
│   │   ├── CatalogView.tsx       # ✅ 메인 카탈로그 뷰
│   │   ├── ApiCard.tsx           # ✅ API 카드
│   │   ├── ApiCatalogGrid.tsx    # ✅ API 그리드 레이아웃
│   │   ├── ApiSearchBar.tsx      # ✅ 검색바 (debounce)
│   │   ├── ApiDetailModal.tsx    # ✅ API 상세 모달
│   │   └── CategoryTabs.tsx      # ✅ 카테고리 탭
│   ├── builder/                  # 빌더 UI
│   │   ├── steps/
│   │   │   └── StepRegistry.ts   # 스텝 등록/관리
│   │   ├── StepIndicator.tsx     # ✅ 3단계 인디케이터
│   │   ├── SelectedApiZone.tsx   # ✅ 선택된 API 표시 영역
│   │   ├── ContextInput.tsx      # ✅ 컨텍스트 텍스트 입력
│   │   ├── GuideQuestions.tsx    # ✅ 가이드 질문 (접기/펴기)
│   │   ├── TemplateSelector.tsx  # ✅ 11개 템플릿 버튼 그룹
│   │   ├── GenerationProgress.tsx # ✅ 생성 진행 상황
│   │   └── PreviewFrame.tsx      # ✅ iframe 미리보기 (디바이스 토글)
│   └── dashboard/                # 대시보드 UI
│       ├── ProjectCard.tsx       # ✅ 프로젝트 카드
│       └── ProjectGrid.tsx       # ✅ 프로젝트 그리드
│
├── hooks/                        # 커스텀 훅 (UI ↔ Service 연결)
│   ├── useAuth.ts
│   ├── useApiCatalog.ts
│   ├── useProjects.ts
│   └── useGeneration.ts
│
├── stores/                       # Zustand 스토어 (분리됨)
│   ├── apiSelectionStore.ts      # API 선택 상태
│   ├── contextStore.ts           # 컨텍스트 입력 상태
│   ├── generationStore.ts        # 코드 생성 상태
│   └── authStore.ts              # 인증 상태
│
├── services/                     # Service Layer (비즈니스 로직)
│   ├── factory.ts                # createProjectService, createCatalogService 등 팩토리 함수
│   ├── authService.ts            # signup / verifyEmail / resendVerification / forgotPassword / resetPassword
│   ├── catalogService.ts
│   ├── projectService.ts
│   └── rateLimitService.ts
│   # 인증 = src/lib/auth/ (getAuthUser 등), 생성 오케스트레이션 = src/lib/ai/generationPipeline.ts
│   # — 둘 다 services/ 의 서비스 클래스가 아님
│   # 외부 DeployService 는 2026-08-01 제거 (제품 배포 = publish/subdomain)
│
├── repositories/                 # Repository Layer (데이터 접근)
│   ├── interfaces/               # Repository 인터페이스 (IBase + I{User,Project,Catalog,Code,Event,UserApiKey,RateLimit,AuthToken,GenerationLock}Repository)
│   ├── sqlite/                   # ✅ SQLite 구현체 9종 (유일 구현 — better-sqlite3 동기 API)
│   │   ├── SqliteUserRepository.ts
│   │   ├── SqliteProjectRepository.ts
│   │   ├── SqliteCatalogRepository.ts
│   │   ├── SqliteCodeRepository.ts
│   │   ├── SqliteEventRepository.ts
│   │   ├── SqliteUserApiKeyRepository.ts
│   │   ├── SqliteRateLimitRepository.ts  # 원자적 레이트리밋 (동기 트랜잭션 + UPDATE…WHERE count<limit RETURNING)
│   │   ├── SqliteAuthTokenRepository.ts  # auth_tokens CRUD (email_verify / password_reset)
│   │   └── SqliteGenerationLockRepository.ts  # generation_locks (중복 생성 차단 DB 락)
│   ├── utils/                    # 공통 유틸 (parseEndpoints, CATEGORY 상수 등)
│   └── factory.ts                # createProjectRepository, createCodeRepository 등 팩토리 함수
│
├── providers/                    # Provider Layer (외부 서비스)
│   └── ai/
│       ├── IAiProvider.ts         # AI Provider 인터페이스
│       ├── ClaudeProvider.ts      # ✅ 구현 완료
│       └── AiProviderFactory.ts   # (OpenAI, Ollama 확장 가능)
│   # providers/deploy/** 는 2026-08-01 제거
│
├── lib/                          # 유틸리티 & 인프라
│   ├── db/                       # SQLite — 유일 DB 경로
│   │   ├── errors.ts             # isUniqueViolation 등 (SQLITE_CONSTRAINT_UNIQUE / "UNIQUE constraint failed")
│   │   └── sqlite/
│   │       ├── connection.ts     # getSqliteDb() — better-sqlite3 핸들 (WAL, SQLITE_PATH 기본 /data/app.db)
│   │       ├── schema.ts         # drizzle-orm/better-sqlite3 스키마 (테이블 11개)
│   │       ├── bootstrap.ts      # bootstrapSqlite() — 마이그레이션(drizzle/sqlite) + seedCatalog (멱등, seedAdmin 제거됨)
│   │       └── seedCatalog.ts    # 카탈로그/플래그 시드 (src/data/{apiCatalog,featureFlags}.json)
│   ├── email/                    # 이메일 발송
│   │   └── emailService.ts       # sendVerificationEmail / sendPasswordResetEmail (Resend provider, no-op fallback)
│   ├── auth/                     # Auth.js v5 local (Credentials + JWT 무상태, DB 어댑터 없음)
│   │   ├── local-auth-config.ts  # Auth.js providers/callbacks 설정 (authorize: DB 조회 + scrypt)
│   │   ├── local-auth-base.ts    # Edge-safe JWT/세션 콜백 (node:crypto 미의존)
│   │   ├── local-auth.ts         # Node 런타임 핸들러 / getAuthUser
│   │   ├── local-auth-edge.ts    # Edge 런타임용 경량 설정 (middleware)
│   │   ├── authorize.ts          # assertOwner — 프로젝트 소유권 검증 (ForbiddenError)
│   │   ├── verifiedGuard.ts      # assertEmailVerified — 이메일 인증 게이트 (403 EMAIL_NOT_VERIFIED)
│   │   ├── password.ts           # scrypt hashPassword / verifyPassword 유틸
│   │   ├── tokens.ts             # auth_tokens 발급·검증·소비 (email_verify/password_reset)
│   │   └── rateLimit.ts          # per-IP 인증 엔드포인트 레이트리밋
│   ├── ai/
│   │   ├── generationPipeline.ts  # 오케스트레이터 — generate/regenerate 공통
│   │   ├── stageRunner.ts         # runStage1 / runStage2Function / runStage3
│   │   ├── generationSaver.ts     # DB 저장 + slug 제안 + 버전 정리 + 이벤트 + SSE complete
│   │   ├── qualityLoop.ts         # shouldRetryGeneration + runQualityLoop (최대 3회 재시도)
│   │   ├── generationTracker.ts   # 서버 메모리 진행 상태 싱글톤 (모바일 폴링용)
│   │   ├── promptBuilder.ts
│   │   ├── codeParser.ts          # HTML 조립·후처리 (Unsplash 귀속 포함)
│   │   ├── codeValidator.ts       # 보안/품질 정적 검증
│   │   ├── autoFix.ts             # LLM 재시도 전 규칙 기반 자동 수정
│   │   ├── categoryDesignMap.ts   # 카테고리별 디자인 테마 매핑
│   │   ├── featureExtractor.ts    # API 기능 명세 추출
│   │   ├── placeholderPatterns.ts # placeholder 탐지 패턴
│   │   ├── preferencesRecommender.ts # UI 설정 추천
│   │   ├── slugSuggester.ts       # AI 기반 slug 제안
│   │   └── sseWriter.ts           # SSE 스트림 유틸리티
│   ├── cache/
│   │   └── proxyCache.ts         # LRU+TTL 인메모리 캐시 (프록시 응답, 최대 500항목)
│   ├── catalog/                 # API 카탈로그 동작 검증 (4모듈)
│   │   ├── healthCheck.ts        # DB 기반 라이브 헬스체크 분류 (+ co-located test)
│   │   ├── keyCheck.ts           # 플랫폼 키 검증 (+ co-located test)
│   │   ├── verifyRunner.ts       # 라이브 검증 오케스트레이터 (verification_status 갱신, admin 트리거)
│   │   └── activeApiCount.ts     # 활성 API 개수 동적 카운트 (랜딩/카탈로그 마케팅 카피)
│   ├── constants/
│   │   └── cdn.ts                # CDN URL 상수 (Tailwind, Pretendard, Font Awesome)
│   # lib/deploy/** 는 2026-08-01 제거 (외부 GitHub/Railway export)
│   ├── config/                  # 환경변수 기반 설정 (4모듈)
│   │   ├── features.ts           # 설정 기반 비즈니스 규칙 (FeatureLimits)
│   │   ├── generation.ts         # 생성 락 heartbeat/stale 등 파이프라인 설정
│   │   ├── qc.ts                 # QC 관련 설정
│   │   └── rateLimit.ts          # Rate limit 설정 (proxy/admin/login/site)
│   ├── events/
│   │   ├── eventBus.ts           # pub/sub 이벤트 버스 (on/emit, fire-and-forget 에러 격리)
│   │   └── eventPersister.ts     # registerEventPersister() — 모든 DomainEvent 자동 DB 기록
│   ├── monitoring/
│   │   ├── slackAlert.ts         # sendSlackAlert() — SLACK_WEBHOOK_URL 설정 시 Slack 알림 전송 (no-op if unset)
│   │   └── errorRateMonitor.ts   # registerErrorRateMonitor() — 5분 윈도우 CODE_GENERATION_FAILED 임계값 초과 시 Slack 알림
│   ├── i18n/
│   │   ├── index.ts              # t(key, params?) 함수 export
│   │   ├── ko.ts                 # 한국어 메시지 (에러·프로젝트 검증·추천 한도)
│   │   └── types.ts              # MessageKey 타입 (자동완성 지원)
│   ├── qc/
│   │   ├── index.ts              # QC 진입점
│   │   ├── deepQcRunner.ts       # 비동기 Deep QC 실행 + ICodeRepository 메타데이터 업데이트
│   │   ├── renderingQc.ts        # Fast/Deep QC 오케스트레이터
│   │   ├── qcChecks.ts           # 개별 체크 함수 (12개)
│   │   └── browserPool.ts        # Playwright 브라우저 풀 (세마포어)
│   └── utils/
│       ├── errors.ts             # 커스텀 에러 클래스 (t() 기반 한국어 메시지)
│       └── logger.ts             # 구조적 로깅
│
├── types/                        # 타입 정의
│   ├── schemas.ts                # Zod 공용 스키마 (generateSchema, createProjectSchema, signupSchema 등 17개)
│   ├── api.ts
│   ├── project.ts
│   ├── events.ts                 # DomainEvent 유니온 타입 (18개 이벤트)
│   └── qc.ts
│
└── templates/                    # 코드 생성 템플릿 (11개)
    ├── ICodeTemplate.ts          # 템플릿 인터페이스 (matchScore, generate, promptHint)
    ├── TemplateRegistry.ts       # 템플릿 등록/조회/매칭 (singleton)
    ├── DashboardTemplate.ts      # 대시보드 (data-dashboard)
    ├── CalculatorTemplate.ts     # 계산기/변환기 (input-result-tool)
    ├── GalleryTemplate.ts        # 갤러리 (masonry-gallery)
    ├── InfoLookupTemplate.ts     # 정보 조회 (search-detail)
    ├── MapServiceTemplate.ts     # 지도 서비스 (map-sidebar)
    ├── ContentFeedTemplate.ts    # 콘텐츠 피드 (vertical-feed)
    ├── ComparisonTemplate.ts     # 실시간 비교 (two-column-comparison)
    ├── TimelineTemplate.ts       # 타임라인/이벤트 (vertical-timeline)
    ├── NewsCuratorTemplate.ts    # 뉴스 큐레이터 (news-grid-curator)
    ├── QuizTemplate.ts           # 퀴즈/인터랙티브 (quiz-flow)
    └── ProfileTemplate.ts        # 프로필/포트폴리오 (profile-portfolio)
```

---

## 4. Provider 인터페이스 상세

### 4.1 AI Provider

```typescript
// src/providers/ai/IAiProvider.ts

export interface AiPrompt {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  extendedThinking?: boolean;
}

export interface AiResponse {
  content: string;
  tokensUsed: { input: number; output: number };
  model: string;
  provider: string;
  durationMs: number;
}

// generateCodeStream의 반환 타입 — AiResponse와 동일한 구조
export type AiStreamResult = AiResponse;

export interface IAiProvider {
  readonly name: string;
  readonly model: string;

  generateCode(prompt: AiPrompt): Promise<AiResponse>;
  generateCodeStream(prompt: AiPrompt, onChunk: (chunk: string, accumulated: string) => void): Promise<AiStreamResult>;
  checkAvailability(): Promise<{ available: boolean; remainingQuota?: number }>;
}
```

**AiProviderFactory 주요 메서드:**
- `createForTask(task: 'generation' | 'suggestion')` — 태스크별 모델 자동 선택 및 인스턴스 캐싱
- `create(type?)` — provider 타입으로 생성
- `clearCache()` — 테스트 등에서 캐시 초기화 시 사용

**확장 방법**: 새 AI 제공자 추가 시
1. `IAiProvider`를 구현하는 새 클래스 생성
2. `AiProviderFactory`에 등록
3. 환경변수 또는 DB 설정으로 활성화

### 4.2 Deploy Provider — 제거됨 (2026-08-01)

외부 GitHub/Railway export 스택(`IDeployProvider`, `RailwayDeployer`, `GithubPagesDeployer`)은 제거됐다.
제품 배포는 **게시 → 서브도메인** (`projectService.publish` / `middleware` rewrite).
배경: [ADR 2026-08-01-remove-external-deploy-stack](../decisions/2026-08-01-remove-external-deploy-stack.md)

### 4.3 Code Template

```typescript
// src/templates/ICodeTemplate.ts

export interface TemplateContext {
  apis: ApiCatalogItem[];
  userContext: string;
  templateId: string;
}

export interface TemplateOutput {
  html: string;
  css: string;
  js: string;
  promptHint: string;  // AI에게 전달할 추가 힌트
}

export interface ICodeTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly supportedApiCategories: string[];

  matchScore(apis: ApiCatalogItem[]): number;  // 0~1 적합도 점수
  generate(context: TemplateContext): TemplateOutput;
}
```

---

## 5. 이벤트 시스템

```typescript
// src/types/events.ts — DomainEvent 유니온 (DEPLOYMENT_* 제거, 2026-08-01)
export type DomainEvent =
  | { type: 'USER_SIGNED_UP'; payload: { userId: string } }
  | { type: 'PROJECT_CREATED'; payload: { projectId: string; userId: string; apiCount: number } }
  | { type: 'CODE_GENERATED'; payload: { projectId: string; version: number; provider: string; durationMs: number } }
  | { type: 'CODE_GENERATION_FAILED'; payload: { projectId: string; error: string; provider: string } }
  | { type: 'PROJECT_DELETED'; payload: { deletedProjectId: string } }  // 삭제된 프로젝트는 FK로 못 가리킨다
  | { type: 'USER_DELETED'; payload: { deletedUserId: string } }  // persist()가 payload.userId를 user_id FK로 추출하므로 deletedUserId 필수
  | { type: 'PROJECT_PUBLISHED'; payload: { projectId: string; userId: string; slug: string } }
  | { type: 'PROJECT_UNPUBLISHED'; payload: { projectId: string; userId: string } }
  | { type: 'API_QUOTA_WARNING'; payload: { service: string; usage: number; limit: number } }
  | { type: 'QC_REPORT_COMPLETED'; payload: { ... } }
  | { type: 'QC_REPORT_FAILED'; payload: { ... } }
  | { type: 'STAGE2_FALLBACK_USED'; payload: { projectId: string; error: string } }
  | { type: 'STAGE3_FALLBACK_USED'; payload: { projectId: string; error: string } }
  | { type: 'STAGE_SKIPPED'; payload: { projectId: string; stage: 'stage2'|'stage3'; reason: string } }
  | { type: 'QUALITY_LOOP_COMPLETED'; payload: { projectId: string; iterations: number; improved: boolean; finalStructuralScore: number; finalMobileScore: number } };

// src/lib/events/eventBus.ts — pub/sub 구독자 시스템
type EventHandler = (event: DomainEvent) => void | Promise<void>;

class EventBus {
  private handlers: EventHandler[] = [];

  // 구독 등록 — 반환값(unsubscribe)으로 해제 가능
  on(handler: EventHandler): () => void { ... }

  // 발행 — 핸들러 에러가 emit 호출자에게 전파되지 않음 (fire-and-forget)
  emit(event: DomainEvent): void { ... }
}

export const eventBus = new EventBus();

// src/lib/events/eventPersister.ts — 기본 구독자: 모든 이벤트 자동 DB 기록
export function registerEventPersister(): void { ... }
// 부팅(instrumentation.ts) 및 generate/regenerate 라우트에서 서버 시작 시 1회 호출 (중복 등록 방지)
```

**발행 지점 (현재 운영 중):**

| 이벤트 | 발행 위치 |
|--------|----------|
| `USER_SIGNED_UP` | `authService.signup()` — 회원가입 완료 시 |
| `USER_DELETED` | `DELETE /api/v1/auth/account` — 계정 삭제 커밋 **이후** (`payload.deletedUserId`) |
| `PROJECT_CREATED` / `PROJECT_DELETED` / `PROJECT_UNPUBLISHED` | `projectService.ts` |
| `CODE_GENERATED` | `generationSaver.ts` |
| `CODE_GENERATION_FAILED` | `generationPipeline.ts` (handlePipelineFailure) |
| `PROJECT_PUBLISHED` / `PROJECT_UNPUBLISHED` | `projectService.ts` |
| `API_QUOTA_WARNING` | `rateLimitService.ts` — 일일 한도 80% 도달 시 (fire-and-forget) |
| `QC_REPORT_COMPLETED` / `QC_REPORT_FAILED` | `generationPipeline.ts` |

**확장 예시 (핵심 로직 수정 없이 구독자만 추가):**
```typescript
// Slack 알림 구독 (errorRateMonitor 패턴)
eventBus.on((event) => {
  if (event.type === 'CODE_GENERATION_FAILED') {
    // 임계값 집계 후 sendSlackAlert
  }
});
```

---

## 6. 설정 기반 비즈니스 규칙

```typescript
// src/lib/config/features.ts

export interface FeatureLimits {
  maxApisPerProject: number;
  maxDailyGenerations: number;
  maxDailySuggestions: number;        // AI 추천 일일 쿼터 (생성과 분리)
  maxProjectsPerUser: number;
  maxRegenerationsPerProject: number;
  maxCodeVersionsPerProject: number;  // 프로젝트당 최대 코드 버전 수
  contextMinLength: number;
  contextMaxLength: number;
}

function env(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const num = Number(val);
  return isNaN(num) ? defaultValue : num;
}

const DEFAULT_LIMITS: FeatureLimits = {
  maxApisPerProject: env('MAX_APIS_PER_PROJECT', 5),
  maxDailyGenerations: env('MAX_DAILY_GENERATIONS', 10),
  maxDailySuggestions: env('MAX_DAILY_SUGGESTIONS', 30),
  maxProjectsPerUser: env('MAX_PROJECTS_PER_USER', 20),
  maxRegenerationsPerProject: env('MAX_REGENERATIONS', 5),
  maxCodeVersionsPerProject: env('MAX_CODE_VERSIONS', 10),
  contextMinLength: env('CONTEXT_MIN_LENGTH', 50),
  contextMaxLength: env('CONTEXT_MAX_LENGTH', 2000),
};

const PLAN_OVERRIDES: Record<string, Partial<FeatureLimits>> = {
  free: {},
  pro: {
    maxApisPerProject: 10,
    maxDailyGenerations: 50,
    maxDailySuggestions: 150,
    maxProjectsPerUser: 100,
    maxCodeVersionsPerProject: 50,
    contextMaxLength: 5000,
  },
};

export function getLimits(plan: string = 'free'): FeatureLimits {
  return { ...DEFAULT_LIMITS, ...(PLAN_OVERRIDES[plan] ?? {}) };
}
```

---

## 7. 데이터 흐름 예시 (레이어 통과)

### 코드 생성 요청 흐름

```
[사용자: "생성하기" 클릭]
    │
    ▼
[Presentation] GenerateStep → useGeneration() 훅 호출
    │
    ▼ POST /api/v1/generate
[API Layer] route.ts
    ├── 인증 확인 (middleware)
    ├── 입력 검증 (Zod: projectId)
    └── generationService.generate(projectId, userId) 호출
    │
    ▼
[Service Layer] GenerationService.generate()
    ├── projectRepository.findById(projectId) → 프로젝트 조회
    ├── catalogRepository.findByIds(apiIds) → API 정보 조회
    ├── featureConfig.getLimits(userPlan) → 한도 확인
    ├── checkDailyLimit(userId) → 일일 생성 횟수 확인
    ├── promptBuilder.build(apis, context) → 프롬프트 구성
    ├── aiProvider.generateCodeStream(prompt) → AI 호출 (Provider)
    ├── codeParser.parse(aiResponse) → HTML/CSS/JS 파싱
    ├── codeValidator.validate(code) → 보안 검증
    ├── codeRepository.save(projectId, code) → DB 저장
    ├── projectRepository.updateStatus('generated') → 상태 업데이트
    └── eventBus.emit('CODE_GENERATED', {...}) → 이벤트 발행
    │
    ▼
[Repository Layer] 각 Repository가 SQLite(better-sqlite3, 동기 API)로 DB 접근
    │
    ▼
[Provider Layer] AiProviderFactory → ClaudeProvider → Claude API (Anthropic) 호출
```

### 인증 흐름 (Auth.js v5 Credentials + JWT)

```
[사용자: 이메일/비밀번호로 로그인]
    │
    ▼ signIn('credentials', { email, password })
[Auth.js Credentials provider] (local-auth-config.ts)
    ├── userRepo.findByEmail(email) → DB 사용자 조회
    ├── verifyPassword(password, user.password_hash) scrypt 검증
    └── 성공 시 { id: user.id, email, name } 반환 (실제 users.id)
    │
    ▼ JWT 발급 (AUTH_SECRET 서명, DB 어댑터 없음 — 무상태)
[세션 쿠키] HttpOnly JWT (token.sub = user.id)
    │
    ▼ redirect /dashboard
[보호 경로] getAuthUser() → JWT 디코드 → user.id로 실제 사용자 신원
[생성·재생성·suggest-*] assertEmailVerified(userId) → 미존재 401 / 미인증 403
  (publish는 이메일 게이트 대상 아님; 외부 deploy 라우트는 2026-08-01 제거)
```

> **핵심**: 공개 셀프서비스 회원가입 + **계정별 완전 데이터 격리** 모델이다. OAuth·Supabase Auth·DB 세션 어댑터·env 단일 관리자(`ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`)는 제거됨.
> 비밀번호는 사용자별 `scrypt` 해시(`users.password_hash`)로 저장. `seedAdminUser`는 제거됨 — 신규 환경은 `/signup`으로 첫 사용자를 생성한다.
> 세션은 `AUTH_SECRET`으로 서명한 JWT라 무상태로 동작한다 (`AUTH_TRUST_HOST=true` — 프록시 뒤 운영).
> 상세: [auth.md](auth.md)

---

## 8. 확장 시나리오별 수정 범위

| 확장 시나리오 | 수정 필요한 레이어 | 수정 범위 |
|-------------|------------------|----------|
| 새 AI 제공자 추가 (OpenAI, Ollama) | Provider만 | 새 클래스 1개 + Factory 등록 |
| 제품 “배포” 변경 | 게시·서브도메인 경로 | 외부 export(Vercel/Railway 사용자 앱) 스택은 **제거됨**(2026-08-01). 제품 배포 = `publish` → `slug.xzawed.xyz` |
| 새 API 카테고리 추가 | 카탈로그 시드 데이터만 | `src/data/apiCatalog.json` 항목 추가 (부팅 시 멱등 시드) |
| 다국어 지원 | i18n 파일 + UI | 번역 파일 추가 |
| 새 빌더 스텝 추가 | StepRegistry + 새 컴포넌트 | 스텝 1개 추가 |
| 웹훅 알림 | EventBus 구독자 + DB | 이벤트 핸들러 추가 |
| 모바일 앱 | API 레이어 재사용 | 별도 앱, API 공유 |

> **참고:** 멀티 테넌시(organizations)·팀 협업·갤러리·좋아요 기능은 **제거됨**. 다중 사용자 모델이나 조직·역할 개념은 없이 **평등한 개인 계정** 구조.
> `users`/`projects` 등 일부 테이블에 `organization_*` 컬럼이 스키마상 잔존하나 항상 `null`이며 어떤 기능도 이를 사용하지 않는다.
