# CustomWebService

무료 API를 골라 담고, 원하는 서비스를 설명하면 AI가 웹서비스를 자동 생성/배포하는 플랫폼

## 주요 기능

- **API 카탈로그**: 30+ 영구 무료 API를 카테고리별로 탐색/검색
- **드래그 앤 드롭 빌더**: 비개발자도 쉽게 API를 선택하고 서비스를 설명
- **AI 코드 생성**: Gemini API 기반 HTML/CSS/JS 웹서비스 자동 생성
- **자동 배포**: Vercel/GitHub Pages 원클릭 배포
- **대시보드**: 생성된 서비스 관리, 미리보기, 상태 모니터링

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS 4 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (Google, GitHub OAuth) |
| AI | Google Gemini API |
| State | Zustand |
| DnD | @dnd-kit |
| Validation | Zod |
| Hosting | Vercel (무료) |
| CI/CD | GitHub Actions |

## 아키텍처

```
Pages/Components → Hooks/Stores → API Routes → Services → Repositories → Supabase
                                                        → Providers → Gemini / Vercel
                                                        → EventBus
                                                        → FeatureConfig
```

| 레이어 | 역할 |
|--------|------|
| **Presentation** | React 페이지, 컴포넌트, Zustand 스토어 |
| **API (Controller)** | 요청 검증, 인증, 응답 포맷팅 |
| **Service** | 비즈니스 로직, 이벤트 발행 |
| **Repository** | Supabase 데이터 접근 추상화 |
| **Provider** | 외부 서비스 추상화 (AI, Deploy) |

## 프로젝트 구조

```
src/
├── app/                     # Next.js App Router
│   ├── (auth)/              # 로그인, OAuth 콜백
│   ├── (main)/              # 카탈로그, 빌더, 대시보드, 미리보기
│   └── api/v1/              # REST API (버저닝)
├── components/              # UI 컴포넌트
├── hooks/                   # 커스텀 훅 (useAuth)
├── stores/                  # Zustand 스토어 (5개 분리)
├── services/                # 비즈니스 로직
├── repositories/            # 데이터 접근 (BaseRepository 패턴)
├── providers/               # 외부 서비스 추상화
│   ├── ai/                  # IAiProvider → GeminiProvider
│   └── deploy/              # IDeployProvider (인터페이스)
├── lib/                     # 유틸리티
│   ├── supabase/            # Supabase 클라이언트
│   ├── ai/                  # 프롬프트 빌더, 코드 파서, 검증기
│   ├── config/              # 설정 시스템, 피처 플래그
│   ├── events/              # 도메인 이벤트 버스
│   └── utils/               # 에러 처리, 로거
├── types/                   # TypeScript 타입 정의
└── templates/               # 코드 생성 템플릿 (확장용)

supabase/
├── migrations/              # DB 스키마 (10개 테이블, RLS)
└── seed.sql                 # 초기 데이터 (15 API, 7 피처 플래그)

.github/
├── workflows/ci.yml         # CI 파이프라인
├── workflows/scheduled.yml  # 정기 API 점검
├── dependabot.yml           # 의존성 보안 스캔
└── PULL_REQUEST_TEMPLATE.md # PR 템플릿
```

## 시작하기

### 사전 요구사항

- Node.js 20+
- pnpm 9+
- Supabase 프로젝트
- Google Gemini API Key

### 1. 저장소 클론 및 의존성 설치

```bash
git clone https://github.com/<your-account>/CustomWebService.git
cd CustomWebService
pnpm install
```

### 2. 환경변수 설정

```bash
cp .env.example .env.local
```

`.env.local`에 다음 값을 설정하세요:

```env
# Supabase (https://supabase.com/dashboard/project/_/settings/api)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Gemini (https://aistudio.google.com/apikey)
GEMINI_API_KEY=your-gemini-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. 데이터베이스 초기화

Supabase Dashboard → SQL Editor에서 순서대로 실행:

```bash
# 1. 스키마 생성 (10개 테이블 + RLS 정책)
supabase/migrations/001_initial_schema.sql

# 2. 초기 데이터 (API 카탈로그 + 피처 플래그)
supabase/seed.sql
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

```bash
pnpm dev            # 개발 서버 (Turbopack)
pnpm build          # 프로덕션 빌드
pnpm start          # 프로덕션 서버
pnpm lint           # ESLint 검사
pnpm lint:fix       # ESLint 자동 수정
pnpm type-check     # TypeScript 타입 검사
pnpm format         # Prettier 포맷팅
pnpm format:check   # 포맷 검사
```

## API 엔드포인트

| Method | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/v1/health` | 서비스 상태 확인 | - |
| GET | `/api/v1/catalog` | API 카탈로그 조회 (검색, 필터) | - |
| GET | `/api/v1/catalog/categories` | 카테고리 목록 | - |
| GET | `/api/v1/projects` | 내 프로젝트 목록 | 필수 |
| POST | `/api/v1/projects` | 프로젝트 생성 | 필수 |
| GET | `/api/v1/projects/:id` | 프로젝트 상세 | 필수 |
| DELETE | `/api/v1/projects/:id` | 프로젝트 삭제 | 필수 |
| POST | `/api/v1/generate` | AI 코드 생성 (SSE) | 필수 |
| POST | `/api/v1/deploy` | 서비스 배포 (SSE) | 필수 |

## 데이터베이스

10개 테이블, 전체 RLS(Row Level Security) 적용:

| 테이블 | 설명 |
|--------|------|
| `users` | 사용자 프로필 |
| `organizations` | 조직 (멀티 테넌시) |
| `memberships` | 조직 멤버십 |
| `api_catalog` | 무료 API 카탈로그 |
| `projects` | 사용자 프로젝트 |
| `project_apis` | 프로젝트-API 매핑 |
| `generated_codes` | AI 생성 코드 (버전 관리) |
| `user_api_keys` | 사용자 API 키 (암호화) |
| `event_log` | 도메인 이벤트 로그 |
| `feature_flags` | 피처 플래그 |

## 확장성 설계

### Provider 패턴으로 외부 서비스 교체 용이

```typescript
// 새 AI 제공자 추가 시
class ClaudeProvider implements IAiProvider { ... }

// AiProviderFactory에 등록하면 끝
```

### 설정 기반 비즈니스 규칙

```typescript
// 환경변수 또는 DB로 조정 가능
MAX_APIS_PER_PROJECT=5
MAX_DAILY_GENERATIONS=10
CONTEXT_MIN_LENGTH=50
```

### 이벤트 시스템으로 기능 확장

```typescript
// 핵심 코드 수정 없이 기능 추가
eventBus.on('CODE_GENERATED', (event) => {
  analytics.track(event);
  slackNotify(event);
});
```

## 보안

- Supabase RLS로 데이터 접근 제어 (테이블 레벨)
- 보안 헤더 (X-Frame-Options, X-Content-Type-Options, CSP)
- 생성 코드 보안 검증 (eval, innerHTML, API 키 노출 탐지)
- API 키 서버사이드 전용 관리 (NEXT_PUBLIC_ 분리)
- 입력 검증 (Zod 스키마)
- 검색어 SQL 인젝션 방어 (특수문자 제거)
- SSE 스트림 안전한 종료 처리

## CI/CD

| 워크플로우 | 트리거 | 내용 |
|-----------|--------|------|
| `ci.yml` | PR/Push (develop, main) | Lint → TypeScript → Build |
| `scheduled.yml` | 매일 06:00 KST | 무료 API 상태 점검 |
| `dependabot.yml` | 매주 월요일 | 의존성 보안 업데이트 |

## 라이선스

MIT
