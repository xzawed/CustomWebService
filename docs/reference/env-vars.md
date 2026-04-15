# 환경변수 레퍼런스

> **주의:** 실제 값은 절대 커밋하지 말 것. `.env.local`(로컬) 또는 Railway Variables(프로덕션)에서 관리.
>
> **Railway 설정 상태** 컬럼: ✅ 설정됨 / ❌ 미설정 / ➖ 해당 없음 (선택 변수)

---

## Supabase

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | Supabase anon 공개 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | 서버사이드 전용 서비스 키 |

---

## Provider 전환 (DB/Auth)

| 변수 | 값 | 필수 조건 | Railway | 설명 |
|------|----|----------|---------|------|
| `DB_PROVIDER` | `supabase` (기본) \| `postgres` | 항상 | ➖ | 미설정 시 `supabase` 기본값 |
| `AUTH_PROVIDER` | `supabase` (기본) \| `authjs` | 항상 | ➖ | 미설정 시 `supabase` 기본값 |
| `NEXT_PUBLIC_AUTH_PROVIDER` | `supabase` (기본) \| `authjs` | 항상 | ➖ | 클라이언트 컴포넌트용 빌드 타임 상수 |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `DB_PROVIDER=postgres` 시 필수 | ❌ | 온프레미스 DB URL |
| `AUTH_SECRET` | 임의 시크릿 | `AUTH_PROVIDER=authjs` 시 필수 | ❌ | NextAuth 세션 서명 키 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth 자격증명 | `AUTH_PROVIDER=authjs` 시 필수 | ❌ | |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth 자격증명 | `AUTH_PROVIDER=authjs` 시 필수 | ❌ | |

---

## AI

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `ANTHROPIC_API_KEY` | ✅ | ✅ | Claude API 키 |
| `AI_MODEL_SUGGESTION` | 선택 | ➖ | 컨텍스트 추천용 모델 (기본: `claude-haiku-4-5`). 허용값: `claude-haiku-4-5` · `claude-sonnet-4-6` · `claude-opus-4-6` |
| `AI_MODEL_GENERATION` | 선택 | ➖ | 코드 생성용 모델 (기본: `claude-sonnet-4-6`). 허용값 동일. **주의**: 날짜 suffix 포함 ID(예: `claude-haiku-4-5-20251001`)는 Anthropic 404 반환 |

---

## 배포

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `NEXT_PUBLIC_ROOT_DOMAIN` | ✅ | ✅ | 서브도메인 루트 도메인 (예: `xzawed.xyz`) |
| `GITHUB_TOKEN` | 배포 시 | ❌ | GitHub API 토큰 (사용자 서비스 자동 배포용) |
| `RAILWAY_TOKEN` | 배포 시 | ❌ | Railway API 토큰 |

---

## 보안

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `ENCRYPTION_KEY` | ✅ | ✅ | 사용자 API 키 AES-256-GCM 암호화 키 (32자 이상) |
| `ADMIN_API_KEY` | ✅ | ✅ | 관리자 API 인증 (`/api/v1/admin/*`) |

---

## 모니터링

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `SENTRY_DSN` | 선택 | ❌ | Sentry 에러 수집 DSN (미설정 시 비활성화) |
| `SENTRY_ORG` | 선택 | ❌ | Sentry 조직 슬러그 (소스맵 업로드용) |
| `SENTRY_PROJECT` | 선택 | ❌ | Sentry 프로젝트 슬러그 |
| `SENTRY_AUTH_TOKEN` | 선택 | ❌ | Sentry 소스맵 업로드 토큰 |

---

## 비즈니스 규칙 (선택, 기본값 있음)

| 변수 | 기본값 | Railway | 설명 |
|------|--------|---------|------|
| `MAX_APIS_PER_PROJECT` | `5` | ➖ | 프로젝트당 최대 API 수 |
| `MAX_DAILY_GENERATIONS` | `10` | ➖ | 사용자당 일일 생성 횟수 |
| `MAX_PROJECTS_PER_USER` | `20` | ➖ | 사용자당 최대 프로젝트 수 |
| `MAX_REGENERATIONS` | `5` | ➖ | 프로젝트당 재생성 횟수 |
| `CONTEXT_MIN_LENGTH` | `50` | ➖ | 컨텍스트 최소 길이 (자) |
| `CONTEXT_MAX_LENGTH` | `2000` | ➖ | 컨텍스트 최대 길이 (자) |
| `GENERATION_TIMEOUT_MS` | `120000` | ➖ | 생성 타임아웃 (ms) |

---

## QC

| 변수 | 기본값 | Railway | 설명 |
|------|--------|---------|------|
| `ENABLE_RENDERING_QC` | `false` | ❌ | Playwright 렌더링 QC 활성화 |

---

## Failover (선택, 기본값 있음)

| 변수 | 기본값 | Railway | 설명 |
|------|--------|---------|------|
| `FAILOVER_ENABLED` | `true` | ➖ | Circuit Breaker 활성화 여부 |
| `FAILOVER_FAILURE_THRESHOLD` | `3` | ➖ | 트립까지 연속 실패 횟수 |
| `FAILOVER_FAILURE_WINDOW_MS` | `30000` | ➖ | 실패 카운트 윈도우 (ms) |
| `FAILOVER_RECOVERY_INTERVAL_MS` | `30000` | ➖ | 복구 프로브 주기 (ms) |
| `FAILOVER_RECOVERY_THRESHOLD` | `2` | ➖ | 복구까지 연속 성공 횟수 |
| `FAILOVER_MIN_DURATION_MS` | `60000` | ➖ | Failover 최소 유지 시간 (ms) |

---

> **Railway 상태 업데이트 방법:** Railway 대시보드 → Variables 탭에서 실제 설정 여부 확인 후 이 파일을 갱신한다.
> Railway 상태가 변경될 때마다 이 표를 최신화하여 디버깅 시 추측을 없앤다.
