# ⚡ CustomWebService

> 무료 API를 골라 담고, 원하는 서비스를 설명하면 AI가 웹서비스를 자동 생성하고 서브도메인으로 즉시 게시하는 올인원 플랫폼

[![license](https://img.shields.io/badge/license-Proprietary-red?style=flat-square)](./README.md#라이선스)
[![status](https://img.shields.io/badge/status-v1.0.0%20Live-brightgreen?style=flat-square)](https://xzawed.xyz)
[![Next.js](https://img.shields.io/badge/Next.js-16+-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![AI](https://img.shields.io/badge/AI-Claude%20Opus%204.7-blueviolet?style=flat-square)](https://anthropic.com)
[![Tests](https://img.shields.io/badge/Tests-529%20passed-success?style=flat-square)](./docs/guides/testing.md)
[![Deploy](https://img.shields.io/badge/Deploy-Railway-8A2BE2?style=flat-square&logo=railway)](https://railway.app)

**🌐 서비스 URL**: [xzawed.xyz](https://xzawed.xyz) &nbsp;|&nbsp; 🇺🇸 [English](./README.en.md)

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
         ↓  조건부: fetch 미호출 또는 placeholder 존재 시
✅ Stage 2 (기능 검증)  — Stage 1 결과를 AI가 자체 검증·수정                           (30→65%)
         ↓  조건부: 품질 점수 80 미만 시
🎨 Stage 3 (디자인)     — 카테고리별 테마 적용 (금융→modern-dark, 날씨→ocean-blue 등)  (65→90%)
         ↓
🔁 Quality Loop         — 최대 3회 재시도, best-of-n 품질 비교 선택
         ↓
⚡ Fast QC              — Playwright 브라우저 렌더링 검증 (콘솔 에러·가로 스크롤·터치 타겟)
         ↓
🔬 Deep QC              — 상호작용·네트워크·접근성·반응형 심층 검증 (비동기, 선택적)
```

### ⚙️ 주요 설계 패턴

| 패턴 | 구현 | 목적 |
|------|------|------|
| 🧠 **모델 분리** | Opus 4.7 (생성) / Haiku 4.5 (추천·제안) | 비용 최적화 |
| 💾 **Prompt Caching** | `cache_control: ephemeral` | 반복 호출 입력 토큰 절감 |
| 🤔 **조건부 Extended Thinking** | 복잡도 스코어링(API 수·인증 방식·엔드포인트·컨텍스트·결제 등 5종 신호, 35pt 임계값) | 복잡한 요청에만 추론 비용 투입 |
| 📡 **EventBus** | 12개 도메인 이벤트, pub/sub + 자동 DB 감사 로그 | 관심사 분리 |
| ⚛️ **원자적 레이트리밋** | `UPDATE WHERE count < limit RETURNING` | 동시 요청 경쟁 조건 방지 |
| 🔌 **Circuit Breaker** | 3회 실패 → TRIPPED, 60초 후 복구 프로브 | DB 장애 전파 차단 |
| 📶 **SSE + 폴링 이중 구조** | `visibilitychange` 감지 → 폴링 전환 | 모바일 백그라운드 탭 대응 |

---

## 🔒 보안

> AI가 생성한 코드는 신뢰할 수 없습니다. 모든 출력물을 의심하고 서버에서 검증합니다.

**🛡️ AI 생성 코드 정적 검증**
- `eval()`, `document.write()`, `innerHTML` 직접 할당 차단
- OpenAI · Stripe · Google · GitHub · Slack · AWS API 키 하드코딩 패턴 감지
- CSS `expression()`, `url(javascript:)`, `url(data:)`, `-moz-binding:`, `-webkit-binding:`, `@import` 등 XSS 벡터 차단

**🏰 인프라 보안**
- Proxy SSRF 방지: loopback(127.0.0.1/::1), RFC1918 사설 IP(10.x/172.16-31.x/192.168.x), AWS 메타데이터 서버(169.254.169.254) 6종 패턴 차단
- `middleware.ts`에서 CSP, HSTS, X-Frame-Options 일괄 적용
- 사용자 API 키 AES-256-GCM 암호화 저장
- OAuth PKCE 플로우 (Google, GitHub)
- `X-Correlation-Id` 헤더로 요청 추적

---

## 🛠️ 기술 스택

| 영역 | 기술 |
|------|------|
| 🖥️ Framework | Next.js 16+ (App Router, TypeScript strict) |
| 🎨 UI | React 19, Tailwind CSS 4, Lucide React |
| 🗄️ State | Zustand (분리 스토어 + persist middleware) |
| 📝 Form | React Hook Form + Zod |
| 🗃️ Database | Supabase (기본) / 온프레미스 PostgreSQL + Drizzle ORM (선택) |
| 🔐 Auth | Supabase Auth (기본) / Auth.js v5 + NextAuth (선택) |
| 🤖 AI | Claude API (Anthropic SDK, claude-opus-4-7 기본) |
| 🧪 Testing | Vitest, happy-dom, MSW, Playwright |
| ⚙️ CI/CD | GitHub Actions → lint → type-check → test → build (Railway 자동 배포) |
| 📦 Package Manager | pnpm |

---

## 📁 프로젝트 구조

```
src/
├── app/
│   ├── api/v1/          # 🔌 REST API 엔드포인트 (22개)
│   ├── (auth)/          # 🔐 인증 페이지
│   ├── (main)/          # 🏠 메인 페이지 (빌더, 카탈로그, 대시보드)
│   └── site/[slug]/     # 🌐 서브도메인 서빙
├── components/          # 🧩 UI 컴포넌트 (builder, catalog, dashboard, gallery)
├── lib/
│   ├── ai/              # 🤖 파이프라인 오케스트레이터, stageRunner, qualityLoop, featureExtractor
│   ├── events/          # 📡 EventBus (pub/sub) + eventPersister (자동 DB 감사 로그)
│   ├── qc/              # 🔬 Playwright 렌더링 QC (Fast/Deep), browserPool
│   ├── config/          # ⚙️ 환경변수 기반 비즈니스 규칙
│   └── utils/           # 🔧 에러 클래스, 암호화, 로거
├── providers/ai/        # 🔀 IAiProvider → ClaudeProvider (교체 가능 인터페이스)
├── repositories/        # 💾 데이터 접근 계층 (BaseRepository 패턴)
├── services/            # ⚡ 비즈니스 로직 계층
├── templates/           # 📐 11개 코드 생성 템플릿 + TemplateRegistry
└── types/               # 📋 Zod 공용 스키마, 도메인 타입, 이벤트 타입
```

---

## 🧪 테스트

| 항목 | 내용 |
|------|------|
| ✅ 총 테스트 수 | **529개** (단위 · 통합 · 컴포넌트 · E2E) |
| 🔬 단위 테스트 | Vitest + happy-dom — AI 파이프라인, 보안 검증, 레이트리밋, Circuit Breaker 등 |
| 🔗 통합 테스트 | Vitest + MSW — API 라우트 인증·입력·권한·비즈니스 로직 전 경로 |
| 🌐 E2E 테스트 | Playwright — 3종 디바이스 (모바일 · 태블릿 · 데스크톱) |
| 📊 커버리지 임계값 | branches 50% · functions/lines/statements 60% |

```bash
pnpm test              # 전체 테스트
pnpm test:coverage     # 커버리지 리포트
pnpm test:e2e          # Playwright E2E
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

---

## ☁️ 인프라 구성

| 항목 | 구성 |
|------|------|
| 🚂 호스팅 | Railway (서브도메인 가상 호스팅, Docker standalone) |
| 🗃️ 데이터베이스 | Supabase (기본, PostgreSQL + RLS) / 온프레미스 PostgreSQL (환경변수 전환) |
| 🔐 인증 | Supabase Auth (기본, OAuth 2.0) / Auth.js v5 (환경변수 전환) |
| 🤖 AI | Claude API (서버사이드 전용) |
| 🌐 도메인 | Railway 커스텀 도메인 |

DB / Auth Provider 환경변수 전환 방법: [docs/decisions/provider-migration.md](docs/decisions/provider-migration.md)

---

## 📄 라이선스

Copyright © 2026 xzawed. All rights reserved.
