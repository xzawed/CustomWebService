# 환경변수 레퍼런스

> **주의:** 실제 값은 절대 커밋하지 말 것. `.env.local`(로컬) 또는 Railway Variables(프로덕션)에서 관리.

---

## Supabase

| 변수 | 필수 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon 공개 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 서버사이드 전용 서비스 키 |

---

## Provider 전환 (DB/Auth)

| 변수 | 값 | 필수 조건 | 설명 |
|------|----|----------|------|
| `DB_PROVIDER` | `supabase` (기본) \| `postgres` | 항상 | DB 구현체 선택 |
| `AUTH_PROVIDER` | `supabase` (기본) \| `authjs` | 항상 | Auth 구현체 선택 |
| `NEXT_PUBLIC_AUTH_PROVIDER` | `supabase` (기본) \| `authjs` | 항상 | 클라이언트 컴포넌트용 빌드 타임 상수 |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `DB_PROVIDER=postgres` 시 필수 | 온프레미스 DB URL |
| `AUTH_SECRET` | 임의 시크릿 | `AUTH_PROVIDER=authjs` 시 필수 | NextAuth 세션 서명 키 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth 자격증명 | `AUTH_PROVIDER=authjs` 시 필수 | |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth 자격증명 | `AUTH_PROVIDER=authjs` 시 필수 | |

---

## AI

| 변수 | 필수 | 설명 |
|------|------|------|
| `ANTHROPIC_API_KEY` | ✅ | Claude API 키 |

---

## 배포

| 변수 | 필수 | 설명 |
|------|------|------|
| `GITHUB_TOKEN` | 배포 시 | GitHub API 토큰 (사용자 서비스 자동 배포용) |
| `RAILWAY_TOKEN` | 배포 시 | Railway API 토큰 |
| `NEXT_PUBLIC_ROOT_DOMAIN` | ✅ | 서브도메인 루트 도메인 (예: `xzawed.xyz`) |

---

## 보안

| 변수 | 필수 | 설명 |
|------|------|------|
| `ENCRYPTION_KEY` | ✅ | 사용자 API 키 AES-256-GCM 암호화 키 (32자 이상) |
| `ADMIN_API_KEY` | ✅ | 관리자 API 인증 (`/api/v1/admin/*`) |

---

## 비즈니스 규칙 (선택, 기본값 있음)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `MAX_APIS_PER_PROJECT` | `5` | 프로젝트당 최대 API 수 |
| `MAX_DAILY_GENERATIONS` | `10` | 사용자당 일일 생성 횟수 |
| `MAX_PROJECTS_PER_USER` | `20` | 사용자당 최대 프로젝트 수 |
| `MAX_REGENERATIONS` | `5` | 프로젝트당 재생성 횟수 |
| `CONTEXT_MIN_LENGTH` | `50` | 컨텍스트 최소 길이 (자) |
| `CONTEXT_MAX_LENGTH` | `2000` | 컨텍스트 최대 길이 (자) |
| `GENERATION_TIMEOUT_MS` | `120000` | 생성 타임아웃 (ms) |

---

## QC

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `ENABLE_RENDERING_QC` | `false` | Playwright 렌더링 QC 활성화 |
