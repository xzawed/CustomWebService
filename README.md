# CustomWebService

무료 API를 골라 담고, 원하는 서비스를 설명하면 AI가 웹서비스를 자동 생성하고 배포까지 완료하는 올인원 플랫폼

## 운영 URL

| 환경 | URL |
|------|-----|
| Production | https://customwebservice-production.up.railway.app |
| Local | http://localhost:3000 |

## 주요 기능

| 기능 | 설명 |
|------|------|
| **API 카탈로그** | 30+ 영구 무료 API를 카테고리별 탐색, 검색, 상세 모달 |
| **3-Step 빌더** | API 선택 → 서비스 설명 → AI 코드 생성 (SSE 실시간 진행률) |
| **AI 코드 생성** | xAI Grok API 기반 HTML/CSS/JS 자동 생성 + 보안 검증 |
| **코드 템플릿** | 대시보드, 계산기, 갤러리 등 3종 기본 템플릿 |
| **자동 배포** | Railway 또는 GitHub Pages에 원클릭 배포 |
| **미리보기** | 생성된 서비스를 디바이스별(모바일/태블릿/데스크톱) 미리보기 |
| **대시보드** | 프로젝트 관리, 상태 모니터링, 롤백 |

## 기술 스택

| 영역 | 기술 | 버전 |
|------|------|------|
| Framework | Next.js (App Router, TypeScript) | 16.2 |
| Runtime | React | 19.2 |
| Styling | Tailwind CSS | 4.2 |
| Icons | Lucide React | 0.577 |
| Database | Supabase (PostgreSQL + RLS) | - |
| Auth | Supabase Auth (Google, GitHub OAuth) | - |
| AI | xAI Grok API (OpenAI SDK 호환) | grok-3-mini |
| State | Zustand (5개 분리 스토어) | 5.0 |
| Form | React Hook Form + Zod | 7.71 / 4.3 |
| DnD | @dnd-kit/core + sortable | 6.3 |
| Deploy | Railway API + GitHub REST API | - |
| CI/CD | GitHub Actions + Dependabot | - |

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation Layer                                          │
│  Pages → Components → Hooks → Stores (Zustand)              │
└──────────────────────────┬──────────────────────────────────┘
                           │ /api/v1/*
┌──────────────────────────▼──────────────────────────────────┐
│  API Layer (Next.js Route Handlers)                          │
│  요청 검증 + 인증 + Zod 스키마 → Service 호출               │
└──────┬─────────────────────┬────────────────────────────────┘
       │                     │
┌──────▼──────┐  ┌───────────▼──────────┐  ┌─────────────────┐
│  Service    │  │  Provider (AI)       │  │  Provider(Deploy)│
│  Layer      │  │  IAiProvider         │  │  IDeployProvider │
│             │  │  └─ GrokProvider     │  │  ├─ Railway      │
│ Catalog     │  │  └─ (확장 가능)       │  │  └─ GitHub Pages│
│ Project     │  └──────────────────────┘  └─────────────────┘
│ Generation  │
│ Deploy      │  ┌──────────────────────┐  ┌─────────────────┐
│ Auth        │  │  EventBus            │  │  FeatureConfig   │
└──────┬──────┘  │  도메인 이벤트 발행    │  │  설정 기반 규칙   │
       │         └──────────────────────┘  └─────────────────┘
┌──────▼──────┐
│  Repository │
│  Layer      │
│  BaseRepo → Supabase
└─────────────┘
```

## 프로젝트 구조

```
src/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 로그인, OAuth 콜백
│   │   ├── login/page.tsx
│   │   └── callback/page.tsx
│   ├── (main)/                   # 메인 페이지 그룹
│   │   ├── builder/page.tsx      # 3-Step 빌더
│   │   ├── catalog/page.tsx      # API 카탈로그
│   │   ├── dashboard/page.tsx    # 프로젝트 대시보드
│   │   ├── dashboard/[id]/page.tsx
│   │   └── preview/[id]/page.tsx # 미리보기
│   ├── api/v1/                   # REST API (v1 버저닝)
│   │   ├── catalog/              # GET 카탈로그, 카테고리
│   │   ├── projects/             # CRUD + 롤백
│   │   ├── generate/route.ts     # POST 코드 생성 (SSE)
│   │   ├── deploy/route.ts       # POST 배포 (SSE)
│   │   ├── preview/[projectId]/  # GET 미리보기 HTML
│   │   └── health/route.ts       # GET 상태 확인
│   ├── error.tsx                 # 에러 바운더리
│   ├── not-found.tsx             # 404 페이지
│   ├── layout.tsx                # 루트 레이아웃
│   └── page.tsx                  # 랜딩 페이지
│
├── components/                   # UI 컴포넌트
│   ├── builder/                  # 빌더 UI (7개)
│   │   ├── StepIndicator.tsx     # 3단계 인디케이터
│   │   ├── SelectedApiZone.tsx   # 선택된 API 영역
│   │   ├── ContextInput.tsx      # 서비스 설명 입력
│   │   ├── GuideQuestions.tsx    # 가이드 질문 (접기/펴기)
│   │   ├── TemplateSelector.tsx  # 6종 템플릿 버튼
│   │   ├── GenerationProgress.tsx # 생성 진행 상황
│   │   ├── PreviewFrame.tsx      # iframe 미리보기 (디바이스 토글)
│   │   └── steps/StepRegistry.ts # 동적 스텝 관리
│   ├── catalog/                  # 카탈로그 UI (6개)
│   │   ├── CatalogView.tsx       # 메인 카탈로그 뷰
│   │   ├── ApiCard.tsx           # API 카드
│   │   ├── ApiCatalogGrid.tsx    # API 그리드 레이아웃
│   │   ├── ApiSearchBar.tsx      # 검색바 (debounce 300ms)
│   │   ├── ApiDetailModal.tsx    # API 상세 모달
│   │   └── CategoryTabs.tsx      # 카테고리 탭
│   ├── dashboard/                # 대시보드 UI (2개)
│   │   ├── ProjectCard.tsx       # 프로젝트 카드
│   │   └── ProjectGrid.tsx       # 프로젝트 그리드 + 빈 상태
│   └── layout/                   # 공통 레이아웃
│       ├── Header.tsx            # 네비게이션 + 인증 UI
│       └── Footer.tsx            # 푸터
│
├── hooks/                        # 커스텀 훅
│   ├── useAuth.ts                # Supabase Auth 상태
│   ├── useApiCatalog.ts          # API 카탈로그 데이터
│   ├── useProjects.ts            # 프로젝트 CRUD
│   ├── useGeneration.ts          # 코드 생성 SSE 연결
│   └── useDeploy.ts              # 배포 SSE 연결
│
├── stores/                       # Zustand 스토어 (5개 분리)
│   ├── authStore.ts              # 인증 상태
│   ├── apiSelectionStore.ts      # API 선택 상태
│   ├── contextStore.ts           # 컨텍스트 입력 (persist)
│   ├── generationStore.ts        # 코드 생성 상태
│   └── deployStore.ts            # 배포 상태
│
├── services/                     # 비즈니스 로직 (Service Layer)
│   ├── authService.ts            # 인증/사용자 관리
│   ├── catalogService.ts         # API 카탈로그 검색/필터
│   ├── projectService.ts         # 프로젝트 CRUD + 검증
│   ├── generationService.ts      # AI 코드 생성 파이프라인
│   └── deployService.ts          # 배포 오케스트레이션
│
├── repositories/                 # 데이터 접근 (Repository Layer)
│   ├── base/BaseRepository.ts    # 공통 CRUD 추상 클래스
│   ├── userRepository.ts
│   ├── projectRepository.ts
│   ├── catalogRepository.ts
│   ├── codeRepository.ts
│   └── organizationRepository.ts
│
├── providers/                    # 외부 서비스 추상화 (Provider Layer)
│   ├── ai/
│   │   ├── IAiProvider.ts        # AI Provider 인터페이스
│   │   ├── GrokProvider.ts       # xAI Grok 구현
│   │   └── AiProviderFactory.ts  # 팩토리 (확장 가능)
│   └── deploy/
│       ├── IDeployProvider.ts    # Deploy Provider 인터페이스
│       ├── RailwayDeployer.ts    # Railway 배포
│       ├── GithubPagesDeployer.ts # GitHub Pages 배포
│       └── DeployProviderFactory.ts # 플랫폼 팩토리
│
├── lib/                          # 유틸리티
│   ├── ai/                       # AI 코드 생성 도구
│   │   ├── promptBuilder.ts      # 시스템/사용자 프롬프트 생성
│   │   ├── codeParser.ts         # AI 응답 → HTML/CSS/JS 파싱
│   │   └── codeValidator.ts      # 보안/기능 검증
│   ├── deploy/                   # 배포 서비스 연동
│   │   ├── githubService.ts      # GitHub REST API (저장소, 코드 Push)
│   │   └── railwayService.ts     # Railway GraphQL API
│   ├── supabase/                 # Supabase 클라이언트
│   │   ├── client.ts             # 브라우저용
│   │   ├── server.ts             # 서버용 + Service Role
│   │   └── middleware.ts         # 인증 미들웨어
│   ├── config/
│   │   ├── features.ts           # 비즈니스 규칙 (한도, 플랜)
│   │   └── featureFlags.ts       # 피처 플래그 (DB 캐싱)
│   ├── events/eventBus.ts        # 도메인 이벤트 발행/구독
│   ├── i18n/                     # 다국어 (ko, en)
│   └── utils/
│       ├── errors.ts             # 커스텀 에러 클래스 (7종)
│       └── logger.ts             # 구조적 JSON 로깅
│
├── templates/                    # 코드 생성 템플릿
│   ├── ICodeTemplate.ts          # 템플릿 인터페이스
│   ├── TemplateRegistry.ts       # 등록/조회/매칭
│   ├── DashboardTemplate.ts      # 대시보드 템플릿
│   ├── CalculatorTemplate.ts     # 계산기/변환기 템플릿
│   └── GalleryTemplate.ts        # 갤러리 템플릿
│
├── types/                        # TypeScript 타입 정의
│   ├── api.ts                    # ApiCatalogItem, Category, Endpoint
│   ├── project.ts                # Project, GeneratedCode, Status
│   ├── generation.ts             # GenerationStep, ProgressEvent
│   ├── organization.ts           # Organization, Membership, User
│   └── events.ts                 # DomainEvent (9종)
│
├── middleware.ts                  # Next.js 미들웨어 (인증 + 보안 헤더)
│
├── __tests__/                     # 통합 테스트
│   └── api/
│       ├── health.test.ts         # /api/v1/health 통합 테스트
│       └── projects.test.ts       # /api/v1/projects 통합 테스트
│
└── test/                          # 테스트 유틸리티
    ├── setup.ts                   # MSW 서버 초기화
    └── mocks/
        ├── server.ts              # MSW Node 서버
        └── handlers.ts            # xAI API 모의 핸들러

supabase/
├── migrations/001_initial_schema.sql  # 10개 테이블 + RLS
└── seed.sql                           # 15 API + 7 피처 플래그

.github/
├── workflows/ci.yml              # CI: Lint → Type Check → Build
├── workflows/scheduled.yml       # 매일 06:00 KST API 상태 점검
├── dependabot.yml                # 주간 의존성 보안 스캔
└── PULL_REQUEST_TEMPLATE.md      # PR 템플릿
```

**총 92개 소스 파일** (TypeScript/TSX) + **10개 테스트 파일 (94개 테스트)**

## 시작하기

### 사전 요구사항

- Node.js 20+
- pnpm 9+
- Supabase 프로젝트 ([supabase.com](https://supabase.com))
- xAI API Key ([console.x.ai](https://console.x.ai))

### 1. 클론 및 설치

```bash
git clone https://github.com/xzawed/CustomWebService.git
cd CustomWebService
pnpm install
```

### 2. 환경변수 설정

```bash
cp .env.example .env.local
```

`.env.local` 필수 항목:

```env
# Supabase (Dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# xAI Grok (https://console.x.ai)
XAI_API_KEY=your-xai-api-key

# 배포 기능 사용 시 (선택)
GITHUB_TOKEN=your-github-token
GITHUB_ORG=your-github-org
RAILWAY_TOKEN=your-railway-token

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. 데이터베이스 초기화

Supabase Dashboard → SQL Editor에서 순서대로 실행:

```
1. supabase/migrations/001_initial_schema.sql   (10개 테이블 + RLS)
2. supabase/seed.sql                            (API 카탈로그 + 피처 플래그)
```

### 4. OAuth 설정

#### Google OAuth
1. [Google Cloud Console](https://console.cloud.google.com) → 새 프로젝트
2. OAuth 동의 화면 → 외부 → 스코프: email, profile, openid
3. 사용자 인증 정보 → OAuth 클라이언트 ID → 웹 애플리케이션
4. 리디렉션 URI: `https://<SUPABASE_PROJECT_ID>.supabase.co/auth/v1/callback`
5. Supabase Dashboard → Authentication → Providers → Google → Client ID/Secret 입력

#### GitHub OAuth
1. [GitHub Developer Settings](https://github.com/settings/developers) → OAuth Apps → New
2. Callback URL: `https://<SUPABASE_PROJECT_ID>.supabase.co/auth/v1/callback`
3. Supabase Dashboard → Authentication → Providers → GitHub → Client ID/Secret 입력

### 5. 개발 서버 실행

```bash
pnpm dev
```

http://localhost:3000 접속

## 스크립트

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | 개발 서버 (Turbopack) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start` | 프로덕션 서버 |
| `pnpm lint` | ESLint 검사 |
| `pnpm lint:fix` | ESLint 자동 수정 |
| `pnpm type-check` | TypeScript 타입 검사 |
| `pnpm format` | Prettier 포맷팅 |
| `pnpm format:check` | 포맷 검사 |
| `pnpm test` | 단위 + 통합 테스트 실행 (94개) |
| `pnpm test:watch` | 테스트 감시 모드 |
| `pnpm test:unit` | lib, providers 단위 테스트만 |
| `pnpm test:integration` | API 라우트 통합 테스트만 |
| `pnpm test:coverage` | 커버리지 리포트 생성 |

## API 엔드포인트

| Method | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/v1/health` | 서비스 상태 확인 | - |
| GET | `/api/v1/catalog` | API 카탈로그 조회 (검색, 필터, 페이지네이션) | - |
| GET | `/api/v1/catalog/categories` | 카테고리 목록 (카운트 포함) | - |
| POST | `/api/v1/projects` | 프로젝트 생성 | 필수 |
| GET | `/api/v1/projects` | 내 프로젝트 목록 | 필수 |
| GET | `/api/v1/projects/:id` | 프로젝트 상세 | 필수 |
| DELETE | `/api/v1/projects/:id` | 프로젝트 삭제 | 필수 |
| POST | `/api/v1/projects/:id/rollback` | 이전 버전으로 롤백 | 필수 |
| POST | `/api/v1/generate` | AI 코드 생성 (SSE 스트림) | 필수 |
| POST | `/api/v1/deploy` | 서비스 배포 (SSE 스트림) | 필수 |
| GET | `/api/v1/preview/:projectId` | 생성된 HTML 미리보기 | 필수 |

## 데이터베이스

10개 테이블, 전체 RLS(Row Level Security) 적용:

| 테이블 | 설명 |
|--------|------|
| `users` | 사용자 프로필 (언어, 테마 설정) |
| `organizations` | 조직 (멀티 테넌시 준비) |
| `memberships` | 조직-사용자 매핑 (역할: owner/admin/member/viewer) |
| `api_catalog` | 무료 API 카탈로그 (버전, CORS, 프록시 정보 포함) |
| `projects` | 사용자 프로젝트 (상태 라이프사이클: draft→deployed) |
| `project_apis` | 프로젝트-API 매핑 |
| `generated_codes` | AI 생성 코드 (버전 관리, AI 메타데이터) |
| `user_api_keys` | 사용자 API 키 |
| `event_log` | 도메인 이벤트 로그 |
| `feature_flags` | 피처 플래그 (7개 기본 플래그) |

## 확장성 설계

### Provider 패턴 - 외부 서비스 교체/추가

```typescript
// 새 AI 제공자 추가
class ClaudeProvider implements IAiProvider { ... }
// AiProviderFactory에 등록하면 끝

// 새 배포 플랫폼 추가
class VercelDeployer implements IDeployProvider { ... }
// DeployProviderFactory에 등록하면 끝
```

### 설정 기반 비즈니스 규칙

```env
MAX_APIS_PER_PROJECT=5        # 프로젝트당 최대 API 수
MAX_DAILY_GENERATIONS=10      # 일일 생성 횟수
MAX_PROJECTS_PER_USER=20      # 사용자당 최대 프로젝트
CONTEXT_MIN_LENGTH=50         # 컨텍스트 최소 길이
CONTEXT_MAX_LENGTH=2000       # 컨텍스트 최대 길이
```

### 코드 생성 템플릿 - 등록만으로 확장

```typescript
// 새 템플릿 추가
class MapTemplate implements ICodeTemplate {
  matchScore(apis) { ... }  // API 적합도 판단
  generate(context) { ... } // HTML/CSS/JS 골격 생성
}
templateRegistry.register(new MapTemplate());
```

### 이벤트 시스템 - 핵심 코드 수정 없이 기능 추가

```typescript
eventBus.on('CODE_GENERATED', (e) => analytics.track(e));
eventBus.on('DEPLOYMENT_COMPLETED', (e) => slackNotify(e));
```

## 보안

- Supabase RLS로 테이블 레벨 데이터 접근 제어
- 보안 헤더: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy
- 생성 코드 보안 검증: eval(), innerHTML, document.write(), 하드코딩된 API 키 탐지
- API 키 서버사이드 전용 (NEXT_PUBLIC_ 분리)
- Zod 스키마 기반 입력 검증
- 검색어 SQL 인젝션 방어 (특수문자 이스케이프)
- SSE 스트림 안전한 종료 (cancel/abort 처리)

## 테스트

**Vitest 2.x** 기반 단위 + 통합 테스트 94개 (10개 파일)

| 대상 | 파일 | 테스트 수 |
|------|------|----------|
| `lib/ai` (codeParser, codeValidator, promptBuilder) | `src/lib/ai/*.test.ts` | 30 |
| `lib/utils` (errors, handleApiError) | `src/lib/utils/errors.test.ts` | 15 |
| `services` (projectService, generationService) | `src/services/*.test.ts` | 19 |
| `providers` (GrokProvider, AiProviderFactory) | `src/providers/ai/*.test.ts` | 20 |
| API 통합 (`/health`, `/projects`) | `src/__tests__/api/*.test.ts` | 10 |

```bash
pnpm test          # 전체 실행
pnpm test:coverage # 커버리지 포함
```

테스트 환경: Node (서버사이드 중심), MSW로 xAI API 모킹

## CI/CD

| 워크플로우 | 트리거 | 내용 |
|-----------|--------|------|
| `ci.yml` | PR / Push (develop, main) | Lint → TypeCheck → **Test** → Build → Deploy |
| `scheduled.yml` | 매일 06:00 KST | 무료 API 상태 점검 |
| `dependabot.yml` | 매주 월요일 | 의존성 보안 업데이트 |

> **테스트가 실패하면 빌드 및 배포가 차단됩니다.**

## 라이선스

MIT
