# ⚡ CustomWebService

> 무료 API를 골라 담고, 원하는 서비스를 설명하면 AI가 웹서비스를 자동 생성하고 서브도메인으로 즉시 게시하는 올인원 플랫폼

[![license](https://img.shields.io/badge/license-Proprietary-red?style=flat-square)](./README.md#라이선스)
[![status](https://img.shields.io/badge/status-v1.0.0%20Live-brightgreen?style=flat-square)](https://xzawed.xyz)
[![Next.js](https://img.shields.io/badge/Next.js-16+-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![AI](https://img.shields.io/badge/AI-Claude%20Opus%205-blueviolet?style=flat-square)](https://anthropic.com)
[![Deploy](https://img.shields.io/badge/Deploy-Railway-8A2BE2?style=flat-square&logo=railway)](https://railway.app)

**🌐 서비스 URL**: [xzawed.xyz](https://xzawed.xyz)

---

## 📖 서비스 소개

CustomWebService는 비개발자도 몇 분 안에 자신만의 웹서비스를 만들 수 있도록 설계된 AI 기반 노코드 플랫폼입니다.

1. 🗂️ **API 선택** — 무료 API 카탈로그에서 원하는 API를 선택
2. ✍️ **서비스 설명** — 자연어로 만들고 싶은 서비스를 설명
3. 🚀 **AI 자동 생성** — AI가 웹페이지를 생성하고 서브도메인으로 즉시 게시

### ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 🗃️ API 카탈로그 | 무료 API를 카테고리별 탐색 및 검색 |
| 🔀 듀얼 빌더 모드 | API-First / Context-First 두 가지 생성 워크플로우 |
| 🤖 AI 코드 생성 | Claude API 기반 자동 생성 + 보안 검증 + 품질 스코어링 |
| 🧭 Relevance Gate | 생성 전 Haiku 기반 미스매치 감지 — 옵션 프리셀렉트 또는 3-way resolution 제공 |
| 📐 템플릿 라이브러리 | 11개 공식 템플릿 (대시보드·갤러리·지도 등) — 레이아웃 구조를 AI에 강제 반영 |
| 🎨 디자인 선호도 | 분위기, 대상 고객, 레이아웃 스타일 선택 가능 — AI가 추천값 프리셀렉트 |
| 🌐 서브도메인 게시 | `slug.xzawed.xyz` 형태로 즉시 게시 |
| 📊 대시보드 | 프로젝트 관리, 버전 롤백, 게시/게시취소 |
| 📱 미리보기 | 디바이스별(모바일/태블릿/데스크톱) 실시간 미리보기 |
| 🔄 코드 재생성 | 피드백 기반 코드 수정 및 개선 |
| 🌈 UI 테마 | 6가지 컬러 테마 선택 |

---

## 🏗️ 아키텍처 하이라이트

### 🤖 AI 코드 생성 파이프라인

```
🔍 Stage 0 (기능 추출)  — Claude Haiku, tool use로 기능 사양 자동 추출 → Stage 1 프롬프트 주입
         ↓
🏗️ Stage 1 (구조·기능)  — 실제 API fetch 호출 코드 생성, 모바일 퍼스트, 보안 규칙 적용  (0→30%)
         ↓  조건부: fetch 미호출·placeholder·하드코딩 배열·프록시 미경유 또는 Fast QC 실패 시
✅ Stage 2 (기능 검증)  — Stage 1 결과를 AI가 자체 검증·수정                           (30→65%)
         ↓  조건부: 구조 점수 < 80 또는 모바일 점수 < 70 등 품질 미달 시
🎨 Stage 3 (디자인)     — 카테고리별 테마 적용 (금융→modern-dark, 날씨→ocean-blue 등)  (65→85%)
         ↓
🔁 Quality Loop         — 기본 2회 재시도(최대 3회), best-of-n 품질 비교 선택
         ↓
⚡ Fast QC              — Playwright 렌더링 검증 (콘솔 에러·가로 스크롤·푸터 가시성·레이아웃 겹침·런타임 placeholder)
         ↓
🔬 Deep QC              — 상호작용·네트워크·접근성·반응형·터치 타겟 심층 검증 (비동기, 선택적)
```

### ⚙️ 주요 설계 패턴

| 패턴 | 구현 | 목적 |
|------|------|------|
| 🧠 **모델 분리** | Opus 5 (생성) / Haiku 4.5 (추천·제안) | 비용 최적화 |
| 💾 **Prompt Caching** | `cache_control: ephemeral` | 반복 호출 입력 토큰 절감 |
| 🤔 **조건부 Extended Thinking** | 복잡도 스코어링(API 수·인증 방식·엔드포인트·컨텍스트·결제 등 5종 신호, 35pt 임계값) | 복잡한 요청에만 추론 비용 투입 |
| 📡 **EventBus** | 도메인 이벤트 pub/sub + `eventPersister` 자동 DB 감사 로그 | 관심사 분리 |
| ⚛️ **원자적 레이트리밋** | SQLite `UPDATE WHERE count < limit RETURNING` (생성·추천 일일 한도) | 동시 요청 경쟁 조건 방지 |
| 📶 **SSE + 폴링 이중 구조** | `visibilitychange` 감지 → 폴링 전환 | 모바일 백그라운드 탭 대응 |
| 🔒 **생성 락** | DB `generation_locks` + heartbeat (진행률은 인메모리 tracker) | 중복 생성 차단 |

파이프라인·불변조건 상세: [docs/architecture/ai-pipeline.md](docs/architecture/ai-pipeline.md) · [docs/architecture/system-spec.md](docs/architecture/system-spec.md)

---

## 🔒 보안

> AI가 생성한 코드는 신뢰할 수 없습니다. 모든 출력물을 의심하고 서버에서 검증합니다.

**🛡️ AI 생성 코드 정적 검증**
- `eval()` 차단(생성 거부) · `document.write()`·`innerHTML` 직접 할당 경고(warning) 감지
- OpenAI · Stripe · Google · GitHub · Slack · AWS API 키 하드코딩 패턴 감지
- CSS `expression()`, `url(javascript:)`, `url(data:)`, `-moz-binding:`, `-webkit-binding:`, `@import` 등 XSS 벡터 차단

**🏰 인프라 보안**
- Proxy SSRF 방지: 차단 호스트·사설 IP + DNS rebinding 방어
- `middleware.ts`에서 CSP, HSTS, X-Frame-Options 일괄 적용
- 사용자 API 키 AES-256-GCM 암호화 저장
- Auth.js v5 Credentials — **공개 셀프서비스 회원가입 + 다중 사용자**, JWT 무상태 세션, 이메일 인증 게이트
- `X-Correlation-Id` 헤더로 요청 추적

---

## 🛠️ 기술 스택

| 영역 | 기술 |
|------|------|
| 🖥️ Framework | Next.js 16+ (App Router, TypeScript strict) |
| 🎨 UI | React 19, Tailwind CSS 4, Lucide React |
| 🗄️ State | Zustand (분리 스토어 + persist middleware) |
| 📝 Form | React 로컬 `useState` + Zod (서버 검증) — React Hook Form 미사용 |
| 🗃️ Database | 임베디드 SQLite (better-sqlite3 + Drizzle ORM, WAL 모드, 단일 인스턴스) |
| 🔐 Auth | Auth.js v5 — Credentials + JWT, 공개 회원가입·다중 사용자·이메일 인증 |
| 🤖 AI | Claude API (Anthropic SDK, 생성 기본 `claude-opus-5`) |
| 🧪 Testing | Vitest, happy-dom, MSW, Playwright |
| ⚙️ CI/CD | GitHub Actions → lint → type-check → test → build (Railway 자동 배포) |
| 📦 Package Manager | pnpm |

---

## 📁 프로젝트 구조

```
src/
├── app/
│   ├── api/             # 🔌 REST API route.ts (40개: auth + /api/v1/*)
│   ├── (auth)/          # 🔐 인증 페이지 (login/signup/…)
│   ├── (main)/          # 🏠 메인 페이지 (빌더, 카탈로그, 대시보드)
│   └── site/[slug]/     # 🌐 서브도메인 서빙
├── components/          # 🧩 UI 컴포넌트 (builder, catalog, dashboard, layout, settings, ui)
├── lib/
│   ├── ai/              # 🤖 파이프라인 오케스트레이터, stageRunner, qualityLoop, featureExtractor
│   ├── catalog/         # 🩺 API 카탈로그 헬스·키 검증 (healthCheck, keyCheck, verifyRunner)
│   ├── events/          # 📡 EventBus + eventPersister
│   ├── qc/              # 🔬 Playwright 렌더링 QC (Fast/Deep), browserPool
│   ├── config/          # ⚙️ 환경변수 기반 비즈니스 규칙
│   └── utils/           # 🔧 에러 클래스, 암호화, 로거
├── providers/ai/        # 🔀 IAiProvider → ClaudeProvider
├── repositories/        # 💾 SQLite 구현 9종 + 무인자 factory (`create*Repository()`)
├── services/            # ⚡ 비즈니스 로직 계층
├── templates/           # 📐 코드 생성 템플릿 + TemplateRegistry
└── types/               # 📋 Zod 공용 스키마, 도메인 타입, 이벤트 타입
```

---

## 🧪 테스트

| 항목 | 내용 |
|------|------|
| 🔬 단위 | `pnpm test:unit` — `src/lib` · `src/providers` · `src/services` · `src/repositories` |
| 🔗 통합 | `pnpm test:integration` — `src/__tests__/api` · `src/app/api` |
| 🌐 E2E | `pnpm test:e2e` — Playwright (`e2e/`) |
| 📊 커버 맵 | 범위·공백은 [docs/reference/test-coverage-map.md](docs/reference/test-coverage-map.md) |
| 📖 전략 | [docs/guides/testing.md](docs/guides/testing.md) |

```bash
pnpm test              # 전체 Vitest
pnpm test:coverage     # 커버리지 리포트
pnpm test:e2e          # Playwright E2E (실 백엔드 env 필요)
```

---

## 💻 개발 명령어

```bash
pnpm dev               # 🔥 개발 서버 (Turbopack)
pnpm build             # 📦 프로덕션 빌드
pnpm type-check        # 🔍 TypeScript 타입 검사
pnpm lint              # 🔎 ESLint 검사
pnpm lint:fix          # 🔧 ESLint 자동 수정
pnpm test              # ✅ 전체 테스트
pnpm test:coverage     # 📊 커버리지 리포트
```

운영 스크립트 예: `pnpm tsx scripts/generateCountries.ts` (국가 데이터 재생성).  
전체 목록은 `package.json` `scripts`와 [CLAUDE.md](./CLAUDE.md)를 본다.

---

## 🚀 설치 및 실행

공개 회원가입 + 임베디드 SQLite 단일 인스턴스. 외부 DB·OAuth·단일 관리자 시드는 없다.

```bash
pnpm install                         # 의존성 설치
cp .env.example .env.local           # 환경변수 템플릿 복사
# .env.local 필수 칸 채우기 (아래 표)
pnpm dev                             # 개발 서버 (Turbopack)
# 브라우저: http://localhost:3000/signup 에서 계정 생성
```

부팅 시 `instrumentation.ts` → `bootstrapSqlite`가 마이그레이션(`drizzle/sqlite`)과 카탈로그/플래그 시드를 **멱등** 적용한다. 관리자 시드(`seedAdmin`)·`pnpm admin:hash`는 **없다** — 첫 사용자는 `/signup`.

### 🔐 환경변수

값은 절대 커밋하지 마세요. 전체 목록은 [docs/reference/env-vars.md](docs/reference/env-vars.md). 스타터 주석은 [.env.example](./.env.example).

**필수 (로컬 기동)**

| 변수 | 설명 |
|------|------|
| `AUTH_SECRET` | Auth.js JWT 서명 (`openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | 프록시/커스텀 도메인 뒤 `true` |
| `NEXT_PUBLIC_AUTH_PROVIDER` | `local` (클라이언트 빌드타임 상수) |
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `ADMIN_API_KEY` | `/api/v1/admin/*` 진단 API |
| `ENCRYPTION_KEY` | 사용자 API 키 AES-256-GCM (32바이트 권장) |
| `NEXT_PUBLIC_APP_URL` | 서비스 기본 URL (로컬 예: `http://localhost:3000`) |
| `NEXT_PUBLIC_ROOT_DOMAIN` | 서브도메인 루트 (로컬 예: `localhost:3000`) |

**권장·선택**

| 변수 | 설명 |
|------|------|
| `SQLITE_PATH` | SQLite 파일 경로 (기본 `/data/app.db` — 로컬은 쓰기 가능한 경로 권장) |
| `APP_URL` | 이메일 인증·재설정 링크 base (미설정 시 ROOT_DOMAIN→origin 폴백) |
| `RESEND_API_KEY` / `EMAIL_FROM` | 실제 이메일 발송 (미설정 시 콘솔 no-op) |
| `SLACK_WEBHOOK_URL` | 운영 알림 |

> Railway 배포 시 SQLite가 영속되도록 `/data` 볼륨 마운트 필요 (`SQLITE_PATH` 기본값과 일치).

---

## ☁️ 인프라 구성

| 항목 | 구성 |
|------|------|
| 🚂 호스팅 | Railway (서브도메인 가상 호스팅, Docker standalone, 단일 인스턴스) |
| 🗃️ 데이터베이스 | 임베디드 SQLite (Railway 영속 볼륨 `/data/app.db`, WAL) |
| 🔐 인증 | Auth.js v5 Credentials + JWT, 공개 회원가입·다중 사용자 |
| 🤖 AI | Claude API (서버사이드 전용) |
| 🌐 도메인 | Railway 커스텀 도메인 (`xzawed.xyz`) |

> 컷오버 배경: [docs/decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md](docs/decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md)  
> 다중 사용자: [docs/decisions/2026-06-24-public-signup-multi-user-auth.md](docs/decisions/2026-06-24-public-signup-multi-user-auth.md)  
> 인증 아키텍처: [docs/architecture/auth.md](docs/architecture/auth.md)  
> 문서 인덱스: [docs/README.md](docs/README.md)

---

## 📄 라이선스

Copyright © 2026 xzawed. All rights reserved.
