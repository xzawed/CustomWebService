# 시스템 아키텍처

> **최종 업데이트:** 2026-04-12  
> **구현 상태:** 운영 중 (286개 테스트 통과)

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
│          호스팅: Railway (무료 Trial)                            │
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
│   /api/v1/deploy/*   → DeployController                        │
│   /api/v1/health     → HealthController                        │
└───────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                   Service Layer (비즈니스 로직)                   │
│                                                                │
│   CatalogService   ProjectService   GenerationService          │
│   DeployService    AuthService      MonitoringService           │
│                                                                │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ EventBus (도메인 이벤트 발행/구독)                         │  │
│   │ PROJECT_CREATED, CODE_GENERATED, DEPLOY_COMPLETED ...   │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ FeatureConfig (설정 기반 비즈니스 규칙)                     │  │
│   │ maxApis, maxGenerations, contextLimits ...               │  │
│   └─────────────────────────────────────────────────────────┘  │
└────────┬──────────────────┬──────────────────┬─────────────────┘
         │                  │                  │
         ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Repository  │  │  Provider 계층    │  │  Provider 계층    │
│  Layer       │  │  (AI)            │  │  (Deploy)        │
│              │  │                  │  │                  │
│ UserRepo     │  │ ┌──────────────┐ │  │ ┌──────────────┐ │
│ ProjectRepo  │  │ │ IAiProvider  │ │  │ │IDeployProv.  │ │
│ CatalogRepo  │  │ ├──────────────┤ │  │ ├──────────────┤ │
│ CodeRepo     │  │ │ClaudeProvider│ │  │ │RailwayDeploy │ │
│ OrgRepo      │  │ │(OpenAI 예정)│ │  │ │GHPagesDeploy │ │
│              │  │ │(Ollama 예정)│ │  │ │(확장 가능)    │ │
│  ↓           │  │ └──────────────┘ │  │ └──────────────┘ │
│ Supabase     │  │                  │  │                  │
│ Client       │  │ + ProviderFactory│  │ + ProviderFactory│
└──────────────┘  └──────────────────┘  └──────────────────┘
```

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
│   │   ├── login/page.tsx        # OAuth 로그인 UI (Google, GitHub)
│   │   └── callback/route.ts     # 서버사이드 OAuth 콜백 핸들러 (PKCE + 사용자 자동 생성)
│   ├── (main)/                   # 메인 페이지 그룹
│   │   ├── catalog/page.tsx
│   │   ├── builder/page.tsx
│   │   ├── dashboard/page.tsx
│   │   └── preview/[id]/page.tsx
│   ├── api/v1/                   # API Routes (v1 버저닝)
│   │   ├── catalog/
│   │   │   ├── route.ts          # GET /api/v1/catalog
│   │   │   ├── [id]/route.ts
│   │   │   └── categories/route.ts
│   │   ├── projects/
│   │   │   ├── route.ts          # GET, POST /api/v1/projects
│   │   │   └── [id]/
│   │   │       ├── route.ts      # GET, DELETE
│   │   │       └── rollback/route.ts  # POST (신규)
│   │   ├── generate/
│   │   │   ├── route.ts          # POST (SSE)
│   │   │   └── regenerate/route.ts
│   │   ├── deploy/
│   │   │   └── route.ts          # POST (SSE) ✅
│   │   ├── preview/
│   │   │   └── [projectId]/route.ts  # GET (text/html) ✅
│   │   └── health/route.ts       # GET
│   ├── layout.tsx
│   └── page.tsx                  # 랜딩 페이지
│
├── __tests__/                    # 통합 테스트
│   └── api/
│       ├── health.test.ts        # GET /api/v1/health (3개)
│       └── projects.test.ts      # GET/POST /api/v1/projects (7개)
│
├── test/                         # 테스트 유틸리티
│   ├── setup.ts                  # MSW 초기화
│   └── mocks/
│       ├── server.ts
│       └── handlers.ts           # xAI Grok API 모킹
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
│   │   ├── TemplateSelector.tsx  # ✅ 6개 템플릿 버튼 그룹
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
│   ├── useGeneration.ts
│   └── useDeploy.ts
│
├── stores/                       # Zustand 스토어 (분리됨)
│   ├── apiSelectionStore.ts      # API 선택 상태
│   ├── contextStore.ts           # 컨텍스트 입력 상태
│   ├── generationStore.ts        # 코드 생성 상태
│   ├── deployStore.ts            # 배포 상태
│   └── authStore.ts              # 인증 상태
│
├── services/                     # Service Layer (비즈니스 로직) ★신규
│   ├── catalogService.ts
│   ├── projectService.ts
│   ├── generationService.ts
│   ├── deployService.ts
│   └── authService.ts            # 인증/사용자 관리 (첫 로그인 시 users 레코드 생성)
│
├── repositories/                 # Repository Layer (데이터 접근) ★신규
│   ├── base/
│   │   └── BaseRepository.ts     # 공통 CRUD 추상 클래스
│   ├── userRepository.ts
│   ├── projectRepository.ts
│   ├── catalogRepository.ts
│   ├── codeRepository.ts
│   └── organizationRepository.ts
│
├── providers/                    # Provider Layer (외부 서비스) ★신규
│   ├── ai/
│   │   ├── IAiProvider.ts         # AI Provider 인터페이스
│   │   ├── GrokProvider.ts        # ✅ 구현 완료
│   │   └── AiProviderFactory.ts   # (OpenAI, Ollama 확장 가능)
│   └── deploy/
│       ├── IDeployProvider.ts     # Deploy Provider 인터페이스
│       ├── RailwayDeployer.ts     # ✅ 구현 완료
│       ├── GithubPagesDeployer.ts # ✅ 구현 완료
│       └── DeployProviderFactory.ts
│
├── lib/                          # 유틸리티 & 인프라
│   ├── supabase/
│   │   ├── client.ts             # 브라우저 클라이언트
│   │   ├── server.ts             # 서버 클라이언트
│   │   └── middleware.ts
│   ├── ai/
│   │   ├── promptBuilder.ts
│   │   ├── codeParser.ts
│   │   └── codeValidator.ts
│   ├── deploy/
│   │   ├── githubService.ts       # ✅ GitHub REST API 연동
│   │   └── railwayService.ts      # ✅ Railway GraphQL API 연동
│   ├── config/
│   │   ├── features.ts           # 설정 기반 비즈니스 규칙 ★신규
│   │   └── featureFlags.ts       # 피처 플래그 ★신규
│   ├── events/
│   │   ├── eventBus.ts           # 이벤트 버스 ★신규
│   │   └── domainEvents.ts       # 이벤트 타입 정의 ★신규
│   ├── i18n/
│   │   ├── index.ts              # i18n 기반 ★신규
│   │   └── locales/
│   │       ├── ko.json
│   │       └── en.json
│   └── utils/
│       ├── errors.ts             # 커스텀 에러 클래스
│       └── logger.ts             # 구조적 로깅
│
├── types/                        # 타입 정의
│   ├── api.ts
│   ├── project.ts
│   ├── generation.ts
│   ├── organization.ts           # ★신규
│   └── events.ts                 # ★신규
│
└── templates/                    # 코드 생성 템플릿 ★신규
    ├── ICodeTemplate.ts          # 템플릿 인터페이스
    ├── DashboardTemplate.ts
    ├── CalculatorTemplate.ts
    ├── GalleryTemplate.ts
    └── TemplateRegistry.ts       # 템플릿 등록/관리
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
}

export interface AiResponse {
  content: string;
  tokensUsed: { input: number; output: number };
  model: string;
  provider: string;
  durationMs: number;
}

export interface IAiProvider {
  readonly name: string;
  readonly model: string;

  generateCode(prompt: AiPrompt): Promise<AiResponse>;
  generateCodeStream(prompt: AiPrompt, onChunk: (chunk: string, accumulated: string) => void): Promise<AiResponse>;
  checkAvailability(): Promise<{ available: boolean; remainingQuota?: number }>;
}
```

**확장 방법**: 새 AI 제공자 추가 시
1. `IAiProvider`를 구현하는 새 클래스 생성
2. `AiProviderFactory`에 등록
3. 환경변수 또는 DB 설정으로 활성화

### 4.2 Deploy Provider

```typescript
// src/providers/deploy/IDeployProvider.ts

export interface FileEntry {
  path: string;
  content: string;
}

export interface DeployResult {
  deploymentId: string;
  url: string;
  platform: string;
  status: 'pending' | 'building' | 'ready' | 'error';
}

export interface IDeployProvider {
  readonly name: string;
  readonly supportedFeatures: ('env_vars' | 'custom_domain' | 'serverless' | 'static_only')[];

  createProject(name: string): Promise<{ projectId: string; repoUrl?: string }>;
  pushFiles(projectId: string, files: FileEntry[]): Promise<void>;
  setEnvironment(projectId: string, env: Record<string, string>): Promise<void>;
  deploy(projectId: string): Promise<DeployResult>;
  getStatus(deploymentId: string): Promise<DeployResult>;
  rollback(projectId: string, version: number): Promise<DeployResult>;
  deleteProject(projectId: string): Promise<void>;
}
```

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
// src/lib/events/domainEvents.ts

export type DomainEvent =
  | { type: 'USER_SIGNED_UP'; payload: { userId: string } }
  | { type: 'PROJECT_CREATED'; payload: { projectId: string; userId: string; apiCount: number } }
  | { type: 'CODE_GENERATED'; payload: { projectId: string; version: number; provider: string; durationMs: number } }
  | { type: 'CODE_GENERATION_FAILED'; payload: { projectId: string; error: string; provider: string } }
  | { type: 'DEPLOYMENT_STARTED'; payload: { projectId: string; platform: string } }
  | { type: 'DEPLOYMENT_COMPLETED'; payload: { projectId: string; url: string; platform: string } }
  | { type: 'DEPLOYMENT_FAILED'; payload: { projectId: string; error: string } }
  | { type: 'PROJECT_DELETED'; payload: { projectId: string } }
  | { type: 'API_QUOTA_WARNING'; payload: { service: string; usage: number; limit: number } };

// src/lib/events/eventBus.ts
class EventBus {
  private handlers = new Map<string, Set<Function>>();

  emit(event: DomainEvent): void { ... }
  on<T extends DomainEvent['type']>(type: T, handler: (event: Extract<DomainEvent, { type: T }>) => void): void { ... }
  off(type: string, handler: Function): void { ... }
}

export const eventBus = new EventBus();
```

**활용 예시**:
```typescript
// 분석 이벤트 구독 (핵심 로직 수정 없이 추가)
eventBus.on('CODE_GENERATED', (event) => {
  analytics.track('code_generated', event.payload);
});

// 알림 구독
eventBus.on('DEPLOYMENT_FAILED', (event) => {
  notificationService.send(event.payload.projectId, '배포에 실패했습니다.');
});

// 모니터링 구독
eventBus.on('API_QUOTA_WARNING', (event) => {
  logger.warn('API quota warning', event.payload);
});
```

---

## 6. 설정 기반 비즈니스 규칙

```typescript
// src/lib/config/features.ts

export interface FeatureLimits {
  maxApisPerProject: number;
  maxDailyGenerations: number;
  maxProjectsPerUser: number;
  maxRegenerationsPerProject: number;
  contextMinLength: number;
  contextMaxLength: number;
  generationTimeoutMs: number;
}

// 기본값 (환경변수로 오버라이드 가능)
const DEFAULT_LIMITS: FeatureLimits = {
  maxApisPerProject: Number(process.env.MAX_APIS_PER_PROJECT ?? 5),
  maxDailyGenerations: Number(process.env.MAX_DAILY_GENERATIONS ?? 10),
  maxProjectsPerUser: Number(process.env.MAX_PROJECTS_PER_USER ?? 20),
  maxRegenerationsPerProject: Number(process.env.MAX_REGENERATIONS ?? 5),
  contextMinLength: Number(process.env.CONTEXT_MIN_LENGTH ?? 50),
  contextMaxLength: Number(process.env.CONTEXT_MAX_LENGTH ?? 2000),
  generationTimeoutMs: Number(process.env.GENERATION_TIMEOUT_MS ?? 120000),
};

// 향후 플랜별 오버라이드 지원
const PLAN_LIMITS: Record<string, Partial<FeatureLimits>> = {
  free: {},
  pro: {
    maxApisPerProject: 10,
    maxDailyGenerations: 50,
    maxProjectsPerUser: 100,
    contextMaxLength: 5000,
  },
};

export function getLimits(plan: string = 'free'): FeatureLimits {
  return { ...DEFAULT_LIMITS, ...(PLAN_LIMITS[plan] ?? {}) };
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
[Repository Layer] 각 Repository가 Supabase 클라이언트로 DB 접근
    │
    ▼
[Provider Layer] AiProviderFactory → ClaudeProvider → Claude API (Anthropic) 호출
```

### OAuth 인증 흐름

```
[사용자: Google/GitHub 로그인 클릭]
    │
    ▼ signInWithOAuth({ redirectTo: /callback })
[Supabase Auth] → Google/GitHub OAuth → 인증 완료
    │
    ▼ /callback?code=xxx
[API Layer] callback/route.ts (서버사이드 Route Handler)
    ├── exchangeCodeForSession(code) → PKCE 코드 교환 (서버 쿠키 접근)
    ├── getUser() → 인증된 사용자 정보
    └── UserRepository.createWithAuthId() → users 테이블 레코드 생성 (첫 로그인 시)
        └── id = auth.uid() (Supabase Auth ID와 동일하게 설정)
    │
    ▼ redirect /dashboard
[Middleware] updateSession()
    └── 인증 쿠키 갱신 → 보호 경로 접근 허용
```

> **핵심**: OAuth 콜백은 반드시 서버사이드 Route Handler에서 처리해야 합니다.
> 클라이언트 컴포넌트에서는 PKCE code verifier 쿠키에 접근할 수 없어 세션 교환이 실패합니다.
> 첫 로그인 시 `auth.uid()`를 `users.id`로 사용하여 FK 정합성을 보장합니다.

---

## 8. 확장 시나리오별 수정 범위

| 확장 시나리오 | 수정 필요한 레이어 | 수정 범위 |
|-------------|------------------|----------|
| 새 AI 제공자 추가 (Grok, OpenAI) | Provider만 | 새 클래스 1개 + Factory 등록 |
| 새 배포 플랫폼 추가 (Vercel) | Provider만 | 새 클래스 1개 + Factory 등록 |
| 새 API 카테고리 추가 | DB 시드 데이터만 | SQL INSERT |
| 유료 플랜 도입 | Config + DB | features.ts 수정 + organizations 테이블 |
| 팀 협업 기능 | Service + Repository + UI | 중간 규모 개발 |
| 다국어 지원 | i18n 파일 + UI | 번역 파일 추가 |
| 새 빌더 스텝 추가 | StepRegistry + 새 컴포넌트 | 스텝 1개 추가 |
| 웹훅 알림 | EventBus 구독자 + DB | 이벤트 핸들러 추가 |
| 모바일 앱 | API 레이어 재사용 | 별도 앱, API 공유 |
