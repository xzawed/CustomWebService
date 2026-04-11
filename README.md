# CustomWebService

무료 API를 골라 담고, 원하는 서비스를 설명하면 AI가 웹서비스를 자동 생성하고 서브도메인으로 즉시 게시하는 올인원 플랫폼

**서비스 URL**: [xzawed.xyz](https://xzawed.xyz)

---

## 서비스 소개

CustomWebService는 비개발자도 몇 분 안에 자신만의 웹서비스를 만들 수 있도록 설계된 AI 기반 노코드 플랫폼입니다.

1. **API 선택** — 무료 API 카탈로그에서 원하는 API를 선택
2. **서비스 설명** — 자연어로 만들고 싶은 서비스를 설명
3. **AI 자동 생성** — AI가 웹페이지를 생성하고 서브도메인으로 즉시 게시

### 주요 기능

| 기능 | 설명 |
|------|------|
| API 카탈로그 | 무료 API를 카테고리별 탐색 및 검색 |
| 듀얼 빌더 모드 | API-First / Context-First 두 가지 생성 워크플로우 |
| AI 코드 생성 | Claude API 기반 자동 생성 + 보안 검증 + 품질 스코어링 |
| 디자인 선호도 | 분위기, 대상 고객, 레이아웃 스타일 선택 가능 |
| 서브도메인 게시 | `slug.xzawed.xyz` 형태로 즉시 게시 |
| 대시보드 | 프로젝트 관리, 버전 롤백, 게시/게시취소 |
| 미리보기 | 디바이스별(모바일/태블릿/데스크톱) 실시간 미리보기 |
| 코드 재생성 | 피드백 기반 코드 수정 및 개선 |
| UI 테마 | 6가지 컬러 테마 선택 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 16+ (App Router, TypeScript strict) |
| UI | React 19, Tailwind CSS 4, Lucide React |
| State | Zustand |
| Validation | Zod |
| Database | Supabase (기본) / 온프레미스 PostgreSQL + Drizzle ORM (선택) |
| Auth | Supabase Auth (기본) / Auth.js v5 + NextAuth (선택) |
| AI | Claude API (Anthropic SDK) |
| Testing | Vitest |
| CI/CD | GitHub Actions |
| Package Manager | pnpm |

---

## 인프라 구성

| 항목 | 구성 |
|------|------|
| 호스팅 | Railway (서브도메인 가상 호스팅) |
| 데이터베이스 | Supabase (기본, PostgreSQL + RLS) / 온프레미스 PostgreSQL (환경변수 전환) |
| 인증 | Supabase Auth (기본, OAuth 2.0) / Auth.js v5 (환경변수 전환) |
| AI | Claude API (서버사이드 전용) |
| 도메인 | Railway 커스텀 도메인 |

### DB / Auth Provider 전환

환경변수 하나로 Supabase ↔ 온프레미스 PostgreSQL을 전환할 수 있습니다.

```env
# DB Provider: supabase(기본) | postgres
DB_PROVIDER=supabase
DATABASE_URL=postgresql://user:pass@host:5432/dbname   # postgres 모드 필수

# Auth Provider: supabase(기본) | authjs
AUTH_PROVIDER=supabase
NEXT_PUBLIC_AUTH_PROVIDER=supabase
AUTH_SECRET=                  # authjs 모드 필수
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
```

---

## 라이선스

All rights reserved.
