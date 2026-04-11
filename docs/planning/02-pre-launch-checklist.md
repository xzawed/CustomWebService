# 사전 작업 체크리스트 & 실행 순서

> Sprint 1 개발 시작 전 3일간 완료해야 하는 모든 사전 작업의 체크리스트와 실행 절차를 통합한 문서

---

## 전체 체크리스트 요약

```
Day 1 (계정 + 인프라)
  ☐ GitHub 계정 + Org + PAT
  ☐ Supabase 프로젝트 + 키
  ☐ Railway 가입 + Token
  ☐ Google OAuth → Supabase 등록
  ☐ GitHub OAuth → Supabase 등록
  ☐ Grok API Key + 테스트

Day 2 (프로젝트 + 설정)
  ☐ Git 저장소 + 브랜치 전략
  ☐ Next.js 프로젝트 + 의존성
  ☐ 환경변수 설정
  ☐ 코드 품질 도구 (Husky, Prettier)
  ☐ DB 스키마 생성 + RLS
  ☐ 디자인 기초 에셋
  ☐ CI/CD 파이프라인

Day 3 (검증 + 테스트)
  ☐ Supabase 연동 테스트
  ☐ OAuth 로그인 테스트
  ☐ Grok 코드 생성 테스트
  ☐ Railway 배포 테스트
  ☐ 무료 API 검증 (54개 등록)
  ☐ 프롬프트 버전 선정

─── Sprint 1 개발 시작 ───
```

---

## Day 1: 계정 생성 및 인프라 구축

### 오전: 외부 서비스 가입 (약 2시간)

```
Step 1 ─ GitHub
  ├── 1.1 GitHub 계정 생성/로그인
  ├── 1.2 Organization 생성: "customwebservice-apps"
  ├── 1.3 Personal Access Token(Classic) 생성
  │       스코프: repo, workflow, admin:org, delete_repo
  └── 1.4 Token 메모장에 임시 저장

Step 2 ─ Supabase
  ├── 2.1 supabase.com 가입 (GitHub 계정 연동)
  ├── 2.2 새 프로젝트 생성
  │       이름: custom-web-service
  │       리전: Northeast Asia (Tokyo)
  │       DB 비밀번호: 강력한 비밀번호 설정 후 안전하게 보관
  ├── 2.3 프로젝트 생성 완료 대기 (약 2분)
  └── 2.4 Settings → API 에서 키 3개 복사
        - Project URL
        - anon public key
        - service_role key (비밀 유지!)

Step 3 ─ Railway
  ├── 3.1 railway.app 가입 (GitHub 계정 연동)
  ├── 3.2 프로젝트 생성 후 Settings → Tokens → Create Token
  └── 3.3 프로젝트 토큰 복사

Step 4 ─ Google Cloud (OAuth용)
  ├── 4.1 console.cloud.google.com 접속
  ├── 4.2 새 프로젝트 생성: "custom-web-service"
  ├── 4.3 API 및 서비스 → OAuth 동의 화면
  │       유형: 외부
  │       앱 이름: CustomWebService
  │       사용자 지원 이메일: 본인 이메일
  │       스코프: email, profile, openid
  ├── 4.4 사용자 인증 정보 → OAuth 클라이언트 ID 만들기
  │       유형: 웹 애플리케이션
  │       이름: CustomWebService Web
  │       승인된 리디렉션 URI:
  │         https://<SUPABASE_PROJECT_ID>.supabase.co/auth/v1/callback
  └── 4.5 Client ID, Client Secret 복사

Step 5 ─ GitHub OAuth App
  ├── 5.1 GitHub → Settings → Developer settings → OAuth Apps
  ├── 5.2 New OAuth App
  │       App name: CustomWebService
  │       Homepage URL: http://localhost:3000 (나중에 변경)
  │       Authorization callback URL:
  │         https://<SUPABASE_PROJECT_ID>.supabase.co/auth/v1/callback
  └── 5.3 Client ID, Client Secret 복사

Step 6 ─ xAI Grok API
  ├── 6.1 console.x.ai 접속
  ├── 6.2 API Keys → Create API key
  └── 6.3 API Key 복사
```

### 오후: OAuth 연동 및 키 정리 (약 1시간)

```
Step 7 ─ Supabase OAuth Provider 등록
  ├── 7.1 Supabase Dashboard → Authentication → Providers
  ├── 7.2 Google 활성화
  │       Client ID: Step 4에서 복사한 값
  │       Client Secret: Step 4에서 복사한 값
  ├── 7.3 GitHub 활성화
  │       Client ID: Step 5에서 복사한 값
  │       Client Secret: Step 5에서 복사한 값
  └── 7.4 Site URL 설정: http://localhost:3000

Step 8 ─ xAI Grok API 테스트
  ├── 8.1 터미널에서 curl 테스트 호출 실행
  ├── 8.2 정상 응답 확인
  └── 8.3 간단한 코드 생성 프롬프트 테스트 1~2건 실행
```

```bash
# xAI Grok API 테스트 호출
curl "https://api.x.ai/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d '{"model":"grok-3-mini","messages":[{"role":"user","content":"Hello"}]}'
```

### Day 1 완료 체크

| # | 항목 | 확인 |
|---|------|------|
| 1 | GitHub 계정 + Organization 생성 | ☐ |
| 2 | GitHub PAT 발급 (스코프: repo, workflow, admin:org, delete_repo) | ☐ |
| 3 | Supabase 프로젝트 생성 + API 키 확보 | ☐ |
| 4 | Railway 가입 + 프로젝트 토큰 발급 | ☐ |
| 5 | Google OAuth 설정 → Supabase 등록 | ☐ |
| 6 | GitHub OAuth 설정 → Supabase 등록 | ☐ |
| 7 | xAI Grok API Key 발급 + 테스트 | ☐ |

---

## Day 2: 프로젝트 초기화 및 기반 설정

### 오전: 프로젝트 셋업 (약 2시간)

```
Step 9 ─ Git 저장소 생성
  ├── 9.1 GitHub에서 저장소 생성: "CustomWebService" (Private)
  ├── 9.2 로컬에서 클론
  │       git clone https://github.com/<계정>/CustomWebService.git
  │       cd CustomWebService
  ├── 9.3 develop 브랜치 생성
  │       git checkout -b develop
  │       git push -u origin develop
  └── 9.4 GitHub → Settings → Branches
          main 브랜치 보호 규칙: PR 필수

Step 10 ─ Next.js 프로젝트 생성
  ├── 10.1 프로젝트 초기화
  │       pnpm create next-app@latest . \
  │         --typescript --tailwind --eslint \
  │         --app --src-dir --import-alias "@/*"
  ├── 10.2 의존성 설치
  │       pnpm add @supabase/supabase-js @supabase/ssr \
  │         zustand @dnd-kit/core @dnd-kit/sortable \
  │         @dnd-kit/utilities react-hook-form \
  │         @hookform/resolvers zod lucide-react \
  │         openai
  ├── 10.3 shadcn/ui 초기화 + 컴포넌트 설치
  │       pnpm dlx shadcn@latest init
  │       pnpm dlx shadcn@latest add button card input \
  │         textarea badge dialog dropdown-menu tabs \
  │         toast progress skeleton avatar separator \
  │         sheet scroll-area
  └── 10.4 개발 서버 확인
          pnpm dev → http://localhost:3000 접속 확인

Step 11 ─ 환경변수 설정
  ├── 11.1 .env.example 생성 (값 없는 키 목록)
  ├── 11.2 .env.local 생성 (실제 키 값 입력)
  └── 11.3 .gitignore에 .env.local 포함 확인
```

`.env.local` 템플릿:

```env
# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxxxxxxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxxxxxxxxxxxx

# --- AI (xAI Grok) ---
XAI_API_KEY=xai-xxxxxxxxxxxxxxxxx

# --- GitHub (생성 서비스 배포용) ---
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxx
GITHUB_ORG=customwebservice-apps

# --- Railway (생성 서비스 배포용) ---
RAILWAY_TOKEN=xxxxxxxxxxxxxxxxx

# --- App ---
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

```
Step 12 ─ 코드 품질 도구
  ├── 12.1 Prettier 설정
  │       .prettierrc 파일 생성
  │       { "semi": true, "singleQuote": true,
  │         "tabWidth": 2, "trailingComma": "es5" }
  ├── 12.2 ESLint 설정 확인 (Next.js 기본 설정)
  ├── 12.3 Husky + lint-staged 설치
  │       pnpm add -D husky lint-staged
  │       pnpm dlx husky init
  └── 12.4 pre-commit 훅 설정 (.husky/pre-commit: pnpm lint-staged)
```

`package.json`에 추가:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

### 오후: DB 및 디자인 기반 (약 2시간)

```
Step 13 ─ Supabase DB 스키마 생성
  ├── 13.1 Supabase Dashboard → SQL Editor 열기
  ├── 13.2 테이블 생성 SQL 실행
  │       (05_데이터베이스_설계.md의 CREATE TABLE 문)
  ├── 13.3 인덱스 생성 SQL 실행
  ├── 13.4 RLS 정책 SQL 실행
  └── 13.5 테이블 생성 확인 (Table Editor에서)

Step 14 ─ 디자인 기초 에셋 준비
  ├── 14.1 텍스트 로고 제작 (Figma 또는 직접 SVG)
  │       또는 Tailwind 텍스트로 임시 대체
  ├── 14.2 파비콘 생성 (RealFaviconGenerator)
  ├── 14.3 public/ 디렉토리에 에셋 배치
  └── 14.4 Pretendard 폰트 설정

Step 15 ─ CI/CD 파이프라인
  ├── 15.1 .github/workflows/ci.yml 생성 (아래 YAML 참조)
  └── 15.2 커밋 + 푸시 → GitHub Actions 실행 확인
```

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm tsc --noEmit

  build:
    runs-on: ubuntu-latest
    needs: lint-and-type-check
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

### Day 2 완료 체크

| # | 항목 | 확인 |
|---|------|------|
| 1 | GitHub 저장소 생성 + 브랜치 전략 설정 (main/develop/feature/*) | ☐ |
| 2 | Next.js 프로젝트 실행 (localhost:3000) | ☐ |
| 3 | 모든 의존성 설치 완료 | ☐ |
| 4 | .env.local 키 값 전부 설정 | ☐ |
| 5 | Husky pre-commit 훅 동작 | ☐ |
| 6 | Supabase 테이블 5개 생성 완료 | ☐ |
| 7 | 파비콘 + 임시 로고 배치 | ☐ |
| 8 | CI 파이프라인 정상 실행 | ☐ |

---

## Day 3: 검증 및 연동 테스트

### 오전: 연동 테스트 (약 2시간)

```
Step 16 ─ Supabase 연동 테스트
  ├── 16.1 src/lib/supabase/client.ts 생성
  │       (Supabase 클라이언트 초기화 코드)
  ├── 16.2 간단한 테스트 페이지에서 api_catalog 조회 테스트
  └── 16.3 정상 응답 확인

Step 17 ─ OAuth 로그인 테스트
  ├── 17.1 Google 로그인 테스트
  │       → 로그인 → 리다이렉트 → 세션 생성 확인
  ├── 17.2 GitHub 로그인 테스트
  │       → 로그인 → 리다이렉트 → 세션 생성 확인
  └── 17.3 문제 발생 시 Supabase Auth 로그 확인

Step 18 ─ Grok API 코드 생성 테스트
  ├── 18.1 Google AI Studio에서 시나리오 1 테스트
  │       (17_AI프롬프트_사전테스트.md 참조)
  ├── 18.2 생성된 코드를 HTML 파일로 저장
  ├── 18.3 브라우저에서 동작 확인
  └── 18.4 프롬프트 버전 선정 (A/B/C 중)

Step 19 ─ Railway 배포 테스트
  ├── 19.1 Railway Dashboard에서 GitHub 저장소 Import
  ├── 19.2 환경변수 설정 (Railway Settings → Environment Variables)
  ├── 19.3 배포 완료 확인
  └── 19.4 배포 URL 접속 확인
```

### 오후: 무료 API 검증 (약 2시간)

```
Step 20 ─ 무료 API 검증 (우선순위 높은 것부터)
  ├── 20.1 인증 불필요 API 일괄 테스트
  │       (16_무료API_사전검증.md의 스크립트 실행)
  ├── 20.2 인증 필요 API 수동 테스트 (주요 5개)
  │       - OpenWeatherMap (가입 + API 키 발급 + 호출)
  │       - GNews (가입 + API 키 발급 + 호출)
  │       - Unsplash (가입 + API 키 발급 + 호출)
  │       - OMDb (가입 + API 키 발급 + 호출)
  │       - 공공데이터포털 (가입 + API 키 발급 + 호출)
  ├── 20.3 CORS 테스트 (브라우저 콘솔에서)
  ├── 20.4 불합격 API 대체 후보 탐색
  └── 20.5 검증 결과 문서 업데이트
```

### Day 3 완료 체크 (= Sprint 1 시작 가능)

| # | 항목 | 확인 |
|---|------|------|
| 1 | Supabase 데이터 조회 테스트 성공 | ☐ |
| 2 | Google 로그인 테스트 성공 | ☐ |
| 3 | GitHub 로그인 테스트 성공 | ☐ |
| 4 | Grok API 코드 생성 테스트 성공 | ☐ |
| 5 | Railway 배포 테스트 성공 | ☐ |
| 6 | 무료 API 54개 등록 완료 (해외 39 + 국내 15) | ☐ |
| 7 | 프롬프트 버전 선정 완료 | ☐ |
| 8 | **모든 Tier 1 항목 완료** | ☐ |

---

## Tier 2: 개발 품질 항목 (Sprint 1 중 완료)

> 개발을 시작할 수는 있지만, 품질/효율을 위해 Sprint 1 중 완료해야 하는 항목

### `.gitignore` 설정

```gitignore
# dependencies
node_modules/
.pnpm-store/

# next.js
.next/
out/

# env files
.env
.env.local
.env.*.local

# vercel
.vercel

# IDE
.vscode/settings.json
.idea/

# OS
.DS_Store
Thumbs.db

# debug
npm-debug.log*
pnpm-debug.log*

# typescript
*.tsbuildinfo

# test coverage
coverage/
```

### 커밋 메시지 컨벤션

```
<type>(<scope>): <subject>
```

| Type | 설명 | 예시 |
|------|------|------|
| `feat` | 새 기능 | `feat(catalog): API 카드 컴포넌트 구현` |
| `fix` | 버그 수정 | `fix(auth): 로그아웃 시 세션 미삭제 수정` |
| `docs` | 문서 변경 | `docs: 스프린트 계획 업데이트` |
| `style` | 코드 포맷 | `style: Prettier 적용` |
| `refactor` | 리팩토링 | `refactor(builder): 스토어 구조 개선` |
| `test` | 테스트 | `test(generate): 코드 파서 단위 테스트` |
| `chore` | 기타 | `chore: 의존성 업데이트` |

### 브랜치 전략

```
main ──────────────────────────────────── 프로덕션
  │
  └── develop ────────────────────────── 개발 통합
        │
        ├── feature/sprint1-auth ──────── 기능 개발
        ├── feature/sprint2-catalog ────
        └── ...

규칙:
- feature/* → develop: PR + 리뷰 후 머지
- develop → main: 스프린트 완료 시 머지 (배포)
- main 직접 푸시 금지
- 머지 전 CI 통과 필수
```

---

## Tier 3: 출시 전 필수 항목 (Sprint 7~8에서 완료)

> 개발 중에는 없어도 되지만, 출시 전 반드시 완료해야 하는 항목

### 모니터링 서비스 계정

| # | 서비스 | 절차 | 완료 시점 | 확인 |
|---|--------|------|-----------|------|
| 1 | **Sentry** | https://sentry.io → 가입 → 프로젝트 생성 (Next.js) → DSN 복사 | Sprint 8 | ☐ |
| 2 | **UptimeRobot** | https://uptimerobot.com → 가입 → 모니터 추가 (메인 URL + API 엔드포인트) | Sprint 8 | ☐ |
| 3 | **Railway Observability** | Railway Dashboard → 프로젝트 → Observability 탭 → Enable | Sprint 8 | ☐ |

### 법적 문서 작성

| # | 문서 | 내용 | 확인 |
|---|------|------|------|
| 1 | **이용약관 (ToS)** | 별도 문서 `15_법적문서.md` 참조 | ☐ |
| 2 | **개인정보처리방침** | 별도 문서 `15_법적문서.md` 참조 | ☐ |
| 3 | **면책 조항** | 생성된 서비스에 대한 책임 한계 | ☐ |

### 디자인 에셋 준비

| # | 에셋 | 규격 | 도구 | 확인 |
|---|------|------|------|------|
| 1 | **로고** | SVG + PNG (다크/라이트 버전) | Figma 또는 Canva (무료) | ☐ |
| 2 | **파비콘** | 16x16, 32x32, 180x180 (apple-touch) | RealFaviconGenerator | ☐ |
| 3 | **OG 이미지** | 1200x630px (소셜 미디어 공유) | Canva | ☐ |
| 4 | **API 카테고리 아이콘** | 24x24 SVG (10개 카테고리) | Lucide Icons (무료) | ☐ |
| 5 | **빈 상태 일러스트** | 검색 결과 없음, 서비스 없음 | unDraw (무료) | ☐ |

### 콘텐츠 준비

| # | 콘텐츠 | 위치 | 확인 |
|---|--------|------|------|
| 1 | 랜딩 페이지 카피 | 히어로 메시지, 섹션별 텍스트 | ☐ |
| 2 | FAQ 답변 | 7~10개 Q&A | ☐ |
| 3 | 에러 메시지 | 각 에러 코드별 사용자 친화 메시지 | ☐ |
| 4 | 성공 메시지 | 생성 완료, 배포 완료 등 | ☐ |
| 5 | 온보딩 가이드 | 첫 사용자 안내 텍스트 | ☐ |
| 6 | 예시 서비스 | 쇼케이스용 3~5개 서비스 시나리오 | ☐ |

### 보안 체크리스트

| # | 항목 | 확인 |
|---|------|------|
| 1 | `.env.local`이 `.gitignore`에 포함 | ☐ |
| 2 | Supabase `service_role` 키 서버사이드에서만 사용 | ☐ |
| 3 | RLS 정책 정상 동작 (다른 사용자 데이터 접근 불가) | ☐ |
| 4 | API Route에 인증 미들웨어 적용 (보호 엔드포인트) | ☐ |
| 5 | 생성 코드 XSS 검증 로직 동작 | ☐ |
| 6 | API 키 하드코딩 검출 로직 동작 | ☐ |
| 7 | CORS 설정 (허용 도메인만) | ☐ |
| 8 | Rate Limiting 적용 (생성 요청 10회/일) | ☐ |
| 9 | iframe sandbox 속성 적용 (미리보기) | ☐ |
| 10 | Dependabot 활성화 (취약 의존성 알림) | ☐ |
