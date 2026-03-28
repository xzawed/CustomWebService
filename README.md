# CustomWebService

무료 API를 골라 담고, 원하는 서비스를 설명하면 AI가 웹서비스를 자동 생성하고 서브도메인으로 즉시 게시하는 올인원 플랫폼

**서비스 URL**: [xzawed.xyz](https://xzawed.xyz)

---

## 서비스 소개

CustomWebService는 비개발자도 몇 분 안에 자신만의 웹서비스를 만들 수 있도록 설계된 AI 기반 노코드 플랫폼입니다.

1. **API 선택** — 54개 영구 무료 API 카탈로그에서 원하는 API를 선택
2. **서비스 설명** — 자연어로 만들고 싶은 서비스를 설명
3. **AI 자동 생성** — AI가 HTML/CSS/JS 코드를 생성하고 즉시 서브도메인으로 게시

### 주요 기능

| 기능 | 설명 |
|------|------|
| API 카탈로그 | 54개 영구 무료 API를 카테고리별 탐색 및 검색 |
| 3-Step 빌더 | API 선택 → 서비스 설명 → AI 코드 생성 (SSE 실시간 진행률) |
| AI 코드 생성 | xAI Grok 기반 HTML/CSS/JS 자동 생성 + 보안 검증 |
| 서브도메인 게시 | `slug.xzawed.xyz` 형태로 즉시 게시 |
| 대시보드 | 프로젝트 관리, 버전 롤백, 게시/게시취소 |
| 미리보기 | 디바이스별(모바일/태블릿/데스크톱) 실시간 미리보기 |
| UI 테마 | 6가지 컬러 테마 선택 (Sky, Lavender, Mint, Peach, Rose, Dusk) |

---

## 방향 및 로드맵

현재는 단일 웹서비스 생성 도구이며, 최종 목표는 **멀티 페이지 웹 플랫폼**으로 확장하는 것입니다.

```
Phase 1 (완료)   핵심 안정성
                 원자적 레이트리밋, 이벤트 영속성, 코드 버전 정책, 요청 추적

Phase 2 (예정)   플랫폼 기반
                 Circuit Breaker, RBAC 활성화, 팀/조직 기능, 서비스 탐색 페이지

Phase 3 (예정)   대규모 확장
                 Marketplace, 템플릿 생태계, 서비스 통계, 관리자 대시보드
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 15+ (App Router, TypeScript strict) |
| UI | React 19, Tailwind CSS 4, Lucide React |
| State | Zustand (분리 스토어 + persist middleware) |
| Form | React Hook Form + Zod |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth (Google, GitHub OAuth) |
| AI | xAI Grok API (OpenAI SDK 호환) |
| Testing | Vitest (단위 + 통합, 136개 테스트) |
| CI/CD | GitHub Actions + Dependabot |

---

## 아키텍처

```
┌─────────────────────────────────────────────┐
│  Presentation Layer                          │
│  Pages → Components → Hooks → Zustand Stores │
└──────────────────┬──────────────────────────┘
                   │ /api/v1/*
┌──────────────────▼──────────────────────────┐
│  API Layer  (Next.js Route Handlers)         │
│  인증 + 유효성 검증 → Service 호출           │
└──────┬─────────────────────┬────────────────┘
       │                     │
┌──────▼──────┐   ┌──────────▼──────────┐
│  Service    │   │  AI Provider        │
│  Layer      │   │  IAiProvider        │
│             │   │  └─ GrokProvider    │
└──────┬──────┘   └─────────────────────┘
       │
┌──────▼──────┐   ┌─────────────────────┐
│  Repository │   │  Event Bus          │
│  Layer      │   │  + EventRepository  │
│  BaseRepo   │   │  (영속적 감사 로그)   │
└──────┬──────┘   └─────────────────────┘
       │
  Supabase (PostgreSQL + RLS)
```

**서브도메인 요청 흐름**
```
slug.xzawed.xyz
  → Middleware (Host 헤더 감지)
  → /site/[slug] 내부 rewrite
  → DB에서 최신 코드 조회
  → HTML 응답 (공개, 인증 불필요)
```

---

## 인프라 구성

| 항목 | 구성 |
|------|------|
| 호스팅 | Railway (단일 인스턴스, 서브도메인 가상 호스팅) |
| 데이터베이스 | Supabase (PostgreSQL, 전체 RLS 적용) |
| 인증 | Supabase Auth (OAuth 2.0 — Google, GitHub) |
| AI | xAI API (서버사이드 전용) |
| CDN/DNS | Railway 커스텀 도메인 |
| 모니터링 | `/api/v1/health` 헬스체크 엔드포인트 |

### 핵심 설계 결정

- **원자적 레이트리밋**: PostgreSQL `UPDATE WHERE count < limit RETURNING` 패턴으로 레이스 컨디션 제거
- **이벤트 영속성**: 인메모리 EventBus + `platform_events` 테이블 병렬 저장 (fire-and-forget)
- **요청 추적**: `X-Correlation-Id` 헤더로 모든 요청 단위 로그 추적 가능
- **Provider 패턴**: `IAiProvider` 인터페이스로 AI 제공자 교체 가능 (현재: xAI Grok)
- **설정 기반 제한**: 환경변수로 생성 한도, 버전 수 등 비즈니스 규칙 조절

---

## 라이선스

MIT
