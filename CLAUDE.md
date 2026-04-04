# CustomWebService — Claude Code 지침

## 프로젝트 개요

AI 기반 노코드 플랫폼. 무료 API를 선택하고 서비스를 설명하면 AI가 HTML/CSS/JS를 생성하여 서브도메인(`slug.xzawed.xyz`)으로 즉시 게시.

- 서비스 URL: https://xzawed.xyz
- 배포: Railway (단일 인스턴스, Dockerfile, standalone output)
- Phase 1 완료 / Phase 2 예정 (Circuit Breaker, RBAC, 팀/조직)

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 16+ (App Router, TypeScript strict) |
| UI | React 19, Tailwind CSS 4, Lucide React |
| State | Zustand (분리 스토어 + persist middleware) |
| Form | React Hook Form + Zod |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth (Google, GitHub OAuth) |
| AI | Claude API (Anthropic SDK) |
| Testing | Vitest, happy-dom, MSW |
| CI/CD | GitHub Actions → lint → type-check → test → build → deploy |
| Package Manager | pnpm |

## 프로젝트 구조

```
src/
├── app/             # Next.js App Router (pages, layouts, API routes)
│   ├── api/         # /api/v1/* REST endpoints
│   ├── (auth)/      # 인증 관련 페이지
│   ├── (main)/      # 메인 페이지 그룹
│   └── site/        # 서브도메인 서빙 ([slug])
├── components/      # UI 컴포넌트 (builder/, catalog/, dashboard/, layout/, settings/, ui/)
├── hooks/           # 커스텀 React hooks
├── lib/             # 유틸리티
│   ├── ai/          # AI 프롬프트, 파이프라인
│   ├── config/      # 환경변수 기반 설정
│   ├── deploy/      # 배포 관련
│   ├── events/      # EventBus + EventRepository
│   ├── i18n/        # 다국어 (t() 함수, 한국어 기본)
│   ├── supabase/    # Supabase 클라이언트
│   └── utils/       # 공통 유틸리티, 에러 클래스
├── middleware.ts     # 서브도메인 라우팅, 보안 헤더 (CSP, HSTS)
├── providers/       # AI Provider (IAiProvider → ClaudeProvider)
├── repositories/    # 데이터 접근 계층 (BaseRepository 패턴)
├── services/        # 비즈니스 로직 계층
├── stores/          # Zustand 스토어
├── templates/       # 코드 생성 템플릿
├── types/           # TypeScript 타입 정의
├── __tests__/       # 테스트 파일 (+ 소스 옆 co-located *.test.ts)
└── test/            # 테스트 헬퍼, 설정
```

## 개발 명령어

```bash
pnpm dev              # 개발 서버 (Turbopack)
pnpm build            # 프로덕션 빌드
pnpm lint             # ESLint 검사
pnpm lint:fix         # ESLint 자동 수정
pnpm type-check       # TypeScript 타입 검사
pnpm format           # Prettier 포맷팅
pnpm format:check     # 포맷 검사
pnpm test             # 전체 테스트
pnpm test:unit        # 단위 테스트 (lib, providers)
pnpm test:integration # 통합 테스트 (API routes)
pnpm test:coverage    # 커버리지 리포트
```

## 코딩 컨벤션

- **TypeScript strict mode** — `any` 사용 금지, export 함수에 명시적 반환 타입
- **Path alias**: `@/*` → `src/*`
- **API 라우트**: `/api/v1/*` 패턴 — 인증 + 유효성 검증 → Service 호출
- **아키텍처 레이어**: Route Handler → Service → Repository → Supabase
- **AI Provider**: `IAiProvider` 인터페이스 — Provider 전용 로직은 Provider 내부에만
- **이벤트 시스템**: `EventBus` + `EventRepository` (감사 로그)
- **레이트리밋**: PostgreSQL 원자적 패턴 (`UPDATE WHERE count < limit RETURNING`)
- **요청 추적**: `X-Correlation-Id` 헤더
- **i18n**: `@/lib/i18n`의 `t()` 함수 사용, 한국어 기본
- **스토어**: 관심사별 분리된 Zustand 스토어 (단일 mega store 금지)
- **에러 처리**: `@/lib/utils/errors`의 커스텀 에러 클래스 사용
- **테스트**: 소스 옆 co-located `*.test.ts` 또는 `src/__tests__/`

## 핵심 설계 결정

- **서브도메인 라우팅**: middleware에서 Host 헤더 감지 → `/site/[slug]` rewrite
- **Standalone output**: Docker/Railway 배포를 위한 Next.js standalone 모드
- **보안 헤더**: middleware에서 CSP, HSTS, X-Frame-Options 설정
- **코드 생성 결과물**: React가 아닌 순수 HTML/CSS/JS (사용자 서비스용)
- **설정 기반 제한**: 환경변수로 생성 한도/버전 수 등 비즈니스 규칙 조절

## 환경변수 (참고용 — 값 절대 포함 금지)

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ROOT_DOMAIN` (서브도메인 가상 호스팅)
- `ANTHROPIC_API_KEY`
- `MAX_APIS_PER_PROJECT`, `MAX_DAILY_GENERATIONS` 등 제한 설정
- `ENABLE_RENDERING_QC` — Playwright 렌더링 QC 활성화 (true/false)

## 문서 참조

- `.claude/docs/` — Claude Code 작업 가이드
  - `architecture.md` — 아키텍처 개요, 파이프라인 흐름
  - `ai-provider.md` — AI Provider 시스템 (Claude)
  - `debugging-guide.md` — 자주 발생하는 문제와 해결
  - `testing-guide.md` — 테스트 구조 및 패턴
  - `deployment.md` — 배포 환경변수 및 체크리스트
- `docs/20_QC_표준_프로세스.md` — **QC 표준 프로세스** (모든 생성/수정에 적용)
- `docs/` — 40+ 상세 설계 문서 (한국어): 아키텍처, DB, API, UI/UX, 스프린트 계획
- `README.md` — 프로젝트 전체 개요
- `.github/PULL_REQUEST_TEMPLATE.md` — PR 템플릿

## 배포 품질 원칙 (필수)

이 서비스는 다수 사용자가 이용 중입니다. 배포 품질 = 서비스 신뢰도.

### CSP / 보안 헤더 변경 시
- `middleware.ts`, `site/[slug]/route.ts`, `preview/[projectId]/route.ts` 3개 파일을 반드시 동시에 확인
- CSP 헤더가 2중 적용되는 경로가 없는지 검증 (HTTP 표준: CSP 2개면 둘 다 적용)
- 프롬프트가 사용하는 CDN이 CSP에서 허용되는지 확인

### 서빙 파이프라인 변경 시
- 미리보기, 게시(직접), 게시(서브도메인) 3가지 경로 모두 추적
- assembleHtml() 변경 시 CSS/JS 누락 여부 확인
- "A에서는 되지만 B에서는 안 된다" 같은 경로별 차이가 없어야 함

### 코드 수정 후
- 수정한 함수/파일을 호출하는 모든 경로를 나열하고 각각 검증
- 단일 파일만 보고 끝내지 않고 cross-cutting concern(미들웨어, 공통 함수) 영향 확인

### QC 프로세스 (생성/재생성 공통)
- 모든 코드 생성/재생성은 `docs/20_QC_표준_프로세스.md`의 8단계를 동일하게 거침
- 보안 검증 → 코드 품질 → Fast QC → 자동 재생성 → 재검증 → 저장 → Deep QC → 사용자 알림
- QC 관련 파일 수정 시: generate/route.ts와 regenerate/route.ts 양쪽 모두 동일하게 반영

## 커밋 메시지 규칙

한국어 커밋 메시지 사용. prefix 패턴: `feat:`, `fix:`, `refactor:`, `ci:`, `docs:`, `test:`
