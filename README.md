# CustomWebService

무료 API를 골라 담고, 원하는 서비스를 설명하면 AI가 웹서비스를 자동 생성하고 서브도메인으로 즉시 게시하는 올인원 플랫폼

## 운영 URL

| 환경 | URL |
|------|-----|
| Production | https://customwebservice.app |
| Railway (구) | https://r4r002eg.up.railway.app |
| Local | http://localhost:8080 |

## 주요 기능

| 기능 | 설명 |
|------|------|
| **API 카탈로그** | 54개 영구 무료 API를 카테고리별 탐색, 검색, 상세 모달 |
| **3-Step 빌더** | API 선택 → 서비스 설명 → AI 코드 생성 (SSE 실시간 진행률) |
| **AI 코드 생성** | xAI Grok API 기반 HTML/CSS/JS 자동 생성 + 보안 검증 |
| **코드 템플릿** | 대시보드, 계산기, 갤러리 등 3종 기본 템플릿 |
| **서브도메인 게시** | `slug.customwebservice.app` 형태로 즉시 게시 (Railway 불필요) |
| **게시/게시취소** | 대시보드에서 원클릭 게시, URL 자동 생성, 클립보드 복사 |
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
| Hosting | 서브도메인 가상 호스팅 (단일 Railway 인스턴스) | - |
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
┌──────▼──────┐  ┌───────────▼──────────┐
│  Service    │  │  Provider (AI)       │
│  Layer      │  │  IAiProvider         │
│             │  │  └─ GrokProvider     │
│ Catalog     │  │  └─ (확장 가능)       │
│ Project     │  └──────────────────────┘
│ Generation  │
│ Auth        │  ┌──────────────────────┐  ┌─────────────────┐
└──────┬──────┘  │  EventBus            │  │  FeatureConfig   │
       │         │  도메인 이벤트 발행    │  │  설정 기반 규칙   │
┌──────▼──────┐  └──────────────────────┘  └─────────────────┘
│  Repository │
│  Layer      │
│  BaseRepo → Supabase
└─────────────┘

서브도메인 요청 흐름:
slug.customwebservice.app
  → Middleware (Host 헤더 감지)
  → /site/[slug] 내부 rewrite
  → ProjectRepository.findBySlug()
  → assembleHtml() → HTML 응답
```

## 프로젝트 구조

```
src/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 로그인, OAuth 콜백
│   │   ├── login/page.tsx        # OAuth 로그인 (Google, GitHub)
│   │   └── callback/route.ts     # 서버사이드 OAuth 콜백 (PKCE + 사용자 자동 생성)
│   ├── (main)/                   # 메인 페이지 그룹
│   │   ├── builder/page.tsx      # 3-Step 빌더
│   │   ├── catalog/page.tsx      # API 카탈로그
│   │   ├── dashboard/page.tsx    # 프로젝트 대시보드
│   │   ├── dashboard/[id]/page.tsx # 프로젝트 상세 + 게시 설정
│   │   ├── preview/[id]/page.tsx # 미리보기
│   │   ├── terms/page.tsx       # 이용약관
│   │   ├── privacy/page.tsx     # 개인정보처리방침
│   │   └── disclaimer/page.tsx  # 면책 조항
│   ├── site/
│   │   └── [slug]/route.ts       # 서브도메인 사이트 서빙 (인증 불필요, 공개)
│   ├── api/v1/                   # REST API (v1 버저닝)
│   │   ├── catalog/              # GET 카탈로그, 카테고리
│   │   ├── projects/             # CRUD + 롤백
│   │   │   └── [id]/publish/     # POST 게시 / DELETE 게시취소
│   │   ├── generate/route.ts     # POST 코드 생성 (SSE)
│   │   ├── preview/[projectId]/  # GET 미리보기 HTML
│   │   └── health/route.ts       # GET 상태 확인
│   ├── error.tsx                 # 에러 바운더리
│   ├── not-found.tsx             # 404 페이지
│   ├── layout.tsx                # 루트 레이아웃
│   └── page.tsx                  # 랜딩 페이지
│
├── components/                   # UI 컴포넌트
│   ├── builder/                  # 빌더 UI (7개)
│   ├── catalog/                  # 카탈로그 UI (6개)
│   ├── dashboard/                # 대시보드 UI (4개)
│   │   ├── ProjectCard.tsx       # 프로젝트 카드 (게시 버튼 + URL 복사 포함)
│   │   ├── ProjectGrid.tsx       # 그리드 + 게시/게시취소/삭제 액션 처리
│   │   └── ProjectPublishActions.tsx # 상세 페이지 게시 섹션 (클라이언트)
│   └── layout/                   # 공통 레이아웃
│       ├── Header.tsx
│       └── Footer.tsx
│
├── hooks/                        # 커스텀 훅
│   ├── useAuth.ts                # Supabase Auth 상태
│   ├── useApiCatalog.ts          # API 카탈로그 데이터
│   ├── useProjects.ts            # 프로젝트 CRUD
│   ├── useGeneration.ts          # 코드 생성 SSE 연결
│   ├── useDeploy.ts              # 배포 SSE 연결 (레거시)
│   └── usePublish.ts             # 게시/게시취소 API 호출
│
├── stores/                       # Zustand 스토어 (5개 분리)
│   ├── authStore.ts
│   ├── apiSelectionStore.ts
│   ├── contextStore.ts           # persist + reset (생성 완료 후 자동 초기화)
│   ├── generationStore.ts
│   └── deployStore.ts
│
├── services/                     # 비즈니스 로직 (Service Layer)
│   ├── authService.ts
│   ├── catalogService.ts
│   ├── projectService.ts         # CRUD + publish() + unpublish()
│   ├── generationService.ts
│   └── deployService.ts          # 레거시 (S6에서 제거 예정)
│
├── repositories/                 # 데이터 접근 (Repository Layer)
│   ├── base/BaseRepository.ts
│   ├── userRepository.ts
│   ├── projectRepository.ts      # findBySlug() + updateSlug() 포함
│   ├── catalogRepository.ts
│   ├── codeRepository.ts
│   └── organizationRepository.ts
│
├── providers/                    # 외부 서비스 추상화
│   ├── ai/
│   │   ├── IAiProvider.ts
│   │   ├── GrokProvider.ts
│   │   └── AiProviderFactory.ts
│   └── deploy/                   # 레거시 (S6에서 제거 예정)
│
├── lib/                          # 유틸리티
│   ├── ai/                       # AI 코드 생성 도구
│   │   ├── promptBuilder.ts
│   │   ├── codeParser.ts         # assembleHtml() — 사이트 서빙에도 사용
│   │   └── codeValidator.ts
│   ├── templates/
│   │   └── siteError.ts          # 404 / 준비 중 HTML 템플릿
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── middleware.ts
│   ├── config/
│   │   ├── features.ts
│   │   └── featureFlags.ts
│   ├── events/eventBus.ts
│   ├── i18n/
│   └── utils/
│       ├── errors.ts
│       ├── logger.ts
│       └── slugify.ts            # toSlug, generateSlug, isValidSlug, RESERVED_SLUGS
│
├── templates/                    # 코드 생성 템플릿
│   ├── ICodeTemplate.ts
│   ├── TemplateRegistry.ts
│   ├── DashboardTemplate.ts
│   ├── CalculatorTemplate.ts
│   └── GalleryTemplate.ts
│
├── types/                        # TypeScript 타입 정의
│   ├── api.ts
│   ├── project.ts                # ProjectStatus: published / unpublished 추가, slug / publishedAt 필드
│   ├── generation.ts
│   ├── organization.ts
│   └── events.ts                 # PROJECT_PUBLISHED / PROJECT_UNPUBLISHED 이벤트 추가
│
├── middleware.ts                  # 서브도메인 감지 + 인증 + 보안 헤더
│
├── __tests__/                     # 통합 테스트
└── test/                          # 테스트 유틸리티

supabase/
├── migrations/001_initial_schema.sql  # 10개 테이블 + RLS
├── migrations/002_slug.sql            # slug, published_at 컬럼 + 인덱스
└── seed.sql                           # 54 API + 7 피처 플래그

docs/
├── sprint-plan.md                # 서브도메인 호스팅 Sprint 계획 및 진행 상황
└── virtual-hosting-plan.md       # 가상 호스팅 아키텍처 설계 문서

.github/
├── workflows/ci.yml
├── workflows/scheduled.yml
├── dependabot.yml
└── PULL_REQUEST_TEMPLATE.md
```

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

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ROOT_DOMAIN=localhost:3000
# 운영 환경: NEXT_PUBLIC_ROOT_DOMAIN=customwebservice.app
```

### 3. 데이터베이스 초기화

Supabase Dashboard → SQL Editor에서 순서대로 실행:

```
1. supabase/migrations/001_initial_schema.sql   (10개 테이블 + RLS)
2. supabase/seed.sql                            (API 카탈로그 + 피처 플래그)
3. supabase/migrations/002_slug.sql             (slug, published_at 컬럼 + 인덱스)
```

**002_slug.sql 내용:**

```sql
ALTER TABLE projects
  ADD COLUMN slug TEXT,
  ADD COLUMN published_at TIMESTAMPTZ;

CREATE UNIQUE INDEX idx_projects_slug
  ON projects (slug) WHERE slug IS NOT NULL;

CREATE INDEX idx_projects_slug_status
  ON projects (slug, status) WHERE slug IS NOT NULL;
```

### 4. OAuth 설정

#### Google OAuth
1. [Google Cloud Console](https://console.cloud.google.com) → 새 프로젝트
2. OAuth 동의 화면 → 외부 → 스코프: email, profile, openid
3. 사용자 인증 정보 → OAuth 클라이언트 ID → 웹 애플리케이션
4. 리디렉션 URI: `https://<SUPABASE_PROJECT_ID>.supabase.co/auth/v1/callback`
5. Supabase → Authentication → Providers → Google → Client ID/Secret 입력
6. Supabase → Authentication → URL Configuration:
   - Site URL: `http://localhost:3000` (개발) 또는 `https://customwebservice.app` (운영)
   - Redirect URLs: `http://localhost:3000/callback`, `https://customwebservice.app/callback`

#### GitHub OAuth
1. [GitHub Developer Settings](https://github.com/settings/developers) → OAuth Apps → New
2. Callback URL: `https://<SUPABASE_PROJECT_ID>.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → GitHub → Client ID/Secret 입력

#### 인증 흐름
```
사용자 → Google/GitHub 클릭 → Supabase OAuth → Google/GitHub 인증
→ Supabase /auth/v1/callback → 앱 /callback (Route Handler)
→ 서버에서 PKCE 코드 교환 + users 테이블 자동 생성 → /dashboard 리다이렉트
```

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
| `pnpm type-check` | TypeScript 타입 검사 |
| `pnpm test` | 단위 + 통합 테스트 실행 |
| `pnpm test:coverage` | 커버리지 리포트 생성 |

## API 엔드포인트

| Method | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/v1/health` | 서비스 상태 확인 | - |
| GET | `/api/v1/catalog` | API 카탈로그 조회 | - |
| GET | `/api/v1/catalog/categories` | 카테고리 목록 | - |
| POST | `/api/v1/projects` | 프로젝트 생성 | 필수 |
| GET | `/api/v1/projects` | 내 프로젝트 목록 | 필수 |
| GET | `/api/v1/projects/:id` | 프로젝트 상세 | 필수 |
| DELETE | `/api/v1/projects/:id` | 프로젝트 삭제 | 필수 |
| POST | `/api/v1/projects/:id/rollback` | 이전 버전 롤백 | 필수 |
| **POST** | **`/api/v1/projects/:id/publish`** | **서브도메인 게시** | 필수 |
| **DELETE** | **`/api/v1/projects/:id/publish`** | **게시 취소** | 필수 |
| POST | `/api/v1/generate` | AI 코드 생성 (SSE) | 필수 |
| GET | `/api/v1/preview/:projectId` | 생성된 HTML 미리보기 | 필수 |
| **GET** | **`/site/:slug`** | **서브도메인 사이트 서빙** | - |

## 서브도메인 게시 흐름

```
1. 빌더에서 서비스 생성 → status: 'generated'
2. 대시보드 "게시" 버튼 클릭
3. POST /api/v1/projects/:id/publish
   → slug 자동 생성 (프로젝트명 기반, 예: weather-app-a1b2c3)
   → DB: slug, published_at 저장, status: 'published'
4. slug.customwebservice.app 접속
   → Middleware: Host 헤더 감지 → /site/slug 내부 rewrite
   → CodeRepository에서 최신 코드 조회
   → assembleHtml() → HTML 응답 (캐시 60초)
```

## 데이터베이스

10개 테이블, 전체 RLS(Row Level Security) 적용:

| 테이블 | 설명 |
|--------|------|
| `users` | 사용자 프로필 |
| `organizations` | 조직 (멀티 테넌시 준비) |
| `memberships` | 조직-사용자 매핑 |
| `api_catalog` | 무료 API 카탈로그 |
| `projects` | 프로젝트 (status 라이프사이클: draft→generated→published) + `slug`, `published_at` |
| `project_apis` | 프로젝트-API 매핑 |
| `generated_codes` | AI 생성 코드 (버전 관리) |
| `user_api_keys` | 사용자 API 키 |
| `event_log` | 도메인 이벤트 로그 |
| `feature_flags` | 피처 플래그 |

### Project 상태 라이프사이클

```
draft → generating → generated ──→ published ⇄ unpublished
                                ↑
                          (deployed: 레거시 호환)
```

## 보안

- Supabase RLS로 테이블 레벨 데이터 접근 제어
- 보안 헤더: `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`
- 미리보기 CSP: `script-src 'unsafe-inline'`, `frame-ancestors 'self'` — iframe 내 동작 허용
- 사이트 서빙 CSP: `frame-ancestors 'none'` — 임베딩 차단
- 서브도메인 요청은 인증 세션 업데이트 없이 직접 rewrite (공개 접근)
- 생성 코드 보안 검증: `eval()`, `innerHTML`, 하드코딩된 API 키 탐지
- API 키 서버사이드 전용 (`NEXT_PUBLIC_` 분리)

## 확장성 설계

### Provider 패턴 — 외부 서비스 교체/추가

```typescript
// 새 AI 제공자 추가
class ClaudeProvider implements IAiProvider { ... }
// AiProviderFactory에 등록하면 끝
```

### 설정 기반 비즈니스 규칙

```env
MAX_APIS_PER_PROJECT=5
MAX_DAILY_GENERATIONS=10
MAX_PROJECTS_PER_USER=20
CONTEXT_MIN_LENGTH=50
CONTEXT_MAX_LENGTH=2000
```

### 이벤트 시스템 — 핵심 코드 수정 없이 기능 추가

```typescript
eventBus.on('PROJECT_PUBLISHED', (e) => analytics.track(e));
eventBus.on('CODE_GENERATED', (e) => notify(e));
```

## CI/CD

| 워크플로우 | 트리거 | 내용 |
|-----------|--------|------|
| `ci.yml` | PR / Push | Lint → TypeCheck → Test → Build → Deploy |
| `scheduled.yml` | 매일 06:00 KST | 무료 API 상태 점검 |
| `dependabot.yml` | 매주 월요일 | 의존성 보안 업데이트 |

## 라이선스

MIT
