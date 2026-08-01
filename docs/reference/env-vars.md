# 환경변수 레퍼런스

> **주의:** 실제 값은 절대 커밋하지 말 것. `.env.local`(로컬) 또는 Railway Variables(프로덕션)에서 관리.
>
> **Railway 설정 상태** 컬럼: ✅ 설정됨 / ❌ 미설정 / ➖ 해당 없음 (선택 변수)
>
> **아키텍처(2026-06-23 컷오버 + 2026-06-24 다중 사용자 전환):** DB는 **임베디드 SQLite**(better-sqlite3, WAL, Railway 영속 볼륨 단일 인스턴스), 인증은 **Auth.js v5 Credentials + JWT 무상태**. 공개 셀프서비스 회원가입, DB 사용자별 scrypt 인증, 이메일 인증 게이트(Resend). Supabase·온프레미스 Postgres·OAuth(Google/GitHub)·`DB_PROVIDER`/`AUTH_PROVIDER` 분기·env 단일 관리자(`ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`/`ADMIN_USER_ID`)는 모두 제거됨. 컷오버 배경: [docs/decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md](../decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md). 다중 사용자 전환: [docs/decisions/2026-06-24-public-signup-multi-user-auth.md](../decisions/2026-06-24-public-signup-multi-user-auth.md).

---

## Database (SQLite)

임베디드 SQLite. 부팅 시 `instrumentation.ts → bootstrapSqlite`가 마이그레이션(`drizzle/sqlite`) → 카탈로그/플래그 시드를 멱등 실행한다. (`seedAdminUser`는 다중 사용자 전환으로 제거됨 — 첫 사용자는 `/signup`으로 생성)

| 변수 | 기본값 | Railway | 설명 |
|------|--------|---------|------|
| `SQLITE_PATH` | `/data/app.db` | ➖ | SQLite DB 파일 경로. Railway 영속 볼륨 마운트 경로(`/data`)에 위치. 로컬 개발 시 별도 경로로 오버라이드 가능 |

### 자동 백업 (P6.3)

부팅 시 `instrumentation.ts → scheduleBackups`가 컨테이너 내에서 주기적으로 SQLite `.backup()` 온라인 덤프를 `<SQLITE 디렉터리>/backups/app-YYYYMMDD-HHmmss.db`로 남기고 보관 정책에 따라 오래된 파일을 정리한다. 외부 의존·비용 없음(단일 인스턴스·Railway 볼륨 전제). 로직: `src/lib/db/sqlite/backup.ts`. **논리 손상·잘못된 마이그레이션·실수 삭제 방어용**. 볼륨 손실 대비 계층(관리자 다운로드·Railway 볼륨 백업·선택적 off-site PUT 시임)은 [operations.md §3.4](../guides/operations.md).

| 변수 | 기본값 | Railway | 설명 |
|------|--------|---------|------|
| `SQLITE_BACKUP_ENABLED` | `true` | ➖ | `false`로 설정 시 자동 백업 비활성화 |
| `SQLITE_BACKUP_INTERVAL_MS` | `86400000` (24h) | ➖ | 백업 주기(ms). 잘못된 값은 기본값으로 폴백 |
| `SQLITE_BACKUP_RETENTION` | `7` | ➖ | 보관할 백업 개수(가장 최근 N개 유지, 나머지 삭제). 1 미만/비정수는 기본값으로 폴백 |
| `SQLITE_BACKUP_DIR` | `<SQLITE_PATH 디렉터리>/backups` | ➖ | 백업 파일 디렉터리. 미설정 시 DB 파일과 같은 볼륨 하위 `backups/` |
| `SQLITE_OFFSITE_BACKUP_URL` | _(미설정)_ | ➖ | 선택. 설정 시 로컬 덤프 성공 후 해당 URL로 **HTTPS PUT**(원시 바이트 + `X-Backup-Sha256`·`X-Backup-Taken-At` 헤더). 미설정 = `NoopOffsiteSink`(로그 없음). **시크릿으로 취급**(presigned/토큰 URL 가능). 실패해도 로컬 백업·prune은 성공으로 남음. 상태: `GET /api/v1/admin/debug` → `offsiteBackup`(URL 미노출)<br>⚠️ **반드시 `https://`여야 한다.** 올라가는 것이 전체 사용자 행·scrypt 해시·암호화된 API 키이므로 평문 전송을 허용하지 않는다. `http://`·기타 스킴은 **fail-closed로 거부**(업로드 안 함)하고 `logger.error` + `offsiteBackup.invalidUrl=true`로 드러난다 — "설정했는데 안 올라간다"를 감추지 않는다 |

### 보존 정책 (무한 증가 테이블 정리)

부팅 시 `instrumentation.ts → scheduleRetention`이 주기적으로 오래된 행을 삭제한다. `generated_codes`만 `pruneOldVersions()`로 정리되고 있었고, 아래 세 테이블은 삭제 경로가 전혀 없어 단조 증가했다(특히 `platform_events`는 EventBus의 **모든** 도메인 이벤트를 기록). 로직: `src/lib/db/sqlite/retention.ts`.

**안전장치** — 삭제는 되돌릴 수 없으므로:
- `auth_tokens`는 **만료됐거나 이미 사용된** 토큰만 지운다. 유효한 미사용 토큰은 아무리 오래돼도 보존한다(사용자의 이메일 인증·비밀번호 재설정 링크가 조용히 죽는 것을 방지).
- `user_daily_limits`의 `usage_date` 비교는 **로컬 날짜** 기준이라 오늘 카운터가 지워지지 않는다.
- 세 DELETE는 하나의 트랜잭션으로 묶여 부분 적용되지 않는다.
- `0`·음수·비정수 값은 기본값으로 폴백한다(`EVENT_RETENTION_DAYS=0` 같은 오설정으로 전체 삭제되는 사고 방지).

| 변수 | 기본값 | Railway | 설명 |
|------|--------|---------|------|
| `DB_RETENTION_ENABLED` | `true` | ➖ | `false`로 설정 시 보존 정책 비활성화 |
| `DB_RETENTION_INTERVAL_MS` | `86400000` (24h) | ➖ | 정리 주기(ms) |
| `EVENT_RETENTION_DAYS` | `90` | ➖ | `platform_events` 보존 일수. 이보다 오래된 감사 이벤트 삭제 |
| `AUTH_TOKEN_RETENTION_DAYS` | `7` | ➖ | `auth_tokens` 유예 일수. 만료/사용된 지 이 기간이 지난 토큰만 삭제 |
| `DAILY_LIMIT_RETENTION_DAYS` | `30` | ➖ | `user_daily_limits` 보존 일수 |

---

## Auth (로컬 — Auth.js v5 Credentials)

DB 어댑터 없는 JWT 무상태 세션. 공개 셀프서비스 회원가입, DB 사용자별 scrypt 인증, 이메일 인증 게이트.
이메일 발송은 Resend를 사용하며 `RESEND_API_KEY` 미설정 시 no-op 콘솔 폴백(이메일 미발송).

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `AUTH_SECRET` | ✅ | ✅ | Auth.js 세션(JWT) 서명 키. 임의 시크릿(`openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | ✅ (프록시 뒤) | ✅ `true` | 리버스 프록시(Railway) 뒤에서 호스트 헤더 신뢰. `true` 설정 |
| `NEXT_PUBLIC_AUTH_PROVIDER` | ✅ | ✅ `local` | 클라이언트 컴포넌트용 빌드 타임 상수. 값은 `local` 고정 |
| `RESEND_API_KEY` | 선택 | ➖ | Resend 이메일 API 키. 미설정 시 no-op 콘솔 폴백(이메일 인증 링크가 실제로 발송되지 않음 — 로컬/테스트 환경 전용) |
| `EMAIL_FROM` | 선택 | ➖ | 이메일 발신자 주소 (예: `noreply@xzawed.xyz`). `RESEND_API_KEY` 설정 시 필수. 도메인 SPF/DKIM 설정 필요(Resend 대시보드). ⚠️ 빈 문자열이면 `?? 기본값` 폴백이 안 됨(null/undefined만 폴백) → 발송 실패하므로 반드시 값 지정. 도메인 미인증 시 `onboarding@resend.dev`는 Resend 가입 계정 이메일로만 발송 |
| `APP_URL` | 권장 | ✅ `https://xzawed.xyz` | 이메일 링크(인증·비밀번호 재설정)의 공개 base URL. 미설정 시 `NEXT_PUBLIC_ROOT_DOMAIN` → 요청 origin 순으로 폴백. 프록시(Railway) 뒤에서 링크가 내부 주소(`0.0.0.0:8080`)로 잡히는 문제 방지 + 요청 호스트 헤더를 신뢰하지 않아 reset-password poisoning 차단 (`getBaseUrl`, `src/lib/auth/routeHelpers.ts`) |

> **제거된 변수 (2026-06-24)**: `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_NAME`, `ADMIN_USER_ID` — env 단일 관리자 경로 완전 제거. 계정은 `/signup` 공개 회원가입으로 생성.
> **유지**: `ADMIN_API_KEY`(진단 엔드포인트 `/api/v1/admin/*` 보호 — 사용자 인증과 무관, 아래 보안 섹션 참조).

---

## AI

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `ANTHROPIC_API_KEY` | ✅ | ✅ | Claude API 키 |
| `AI_PROVIDER` | 선택 | ➖ | AI Provider 선택. 현재 허용값은 `claude` 하나뿐 (기본). 그 외 값 설정 시 `AiProviderFactory.create()`가 `Unknown AI provider` 에러를 던짐. 코드 위치: `src/providers/ai/AiProviderFactory.ts` |
| `AI_MODEL_SUGGESTION` | 선택 | ✅ `claude-haiku-4-5` | 컨텍스트 추천용 모델 (기본: `claude-haiku-4-5` — 4.5가 최신 Haiku이므로 상향 대상 아님). 허용값: `claude-haiku-4-5` · `claude-sonnet-4-6` · `claude-sonnet-5` · `claude-opus-4-6` · `claude-opus-4-7` · `claude-opus-4-8` · `claude-opus-5` |
| `AI_MODEL_GENERATION` | 선택 | ✅ `claude-opus-5` | 코드 생성용 모델 (기본: `claude-opus-5`). 허용값 동일. **허용목록(`ALLOWED_CLAUDE_MODELS`)에 없는 값은 경고 로그만 남기고 조용히 기본값으로 폴백**하므로 모델 추가 시 `src/providers/ai/AiProviderFactory.ts`를 함께 수정할 것. **구세대 ID를 목록에서 지우면 env 롤백이 무시된다.** 주의: 날짜 suffix 포함 ID는 허용목록에 없어 폴백됨 |
| `ET_COMPLEXITY_THRESHOLD` | 선택 | ➖ | Extended Thinking 활성화 복잡도 임계값 (기본: `35`). 0-100 점수 중 이 값 이상이면 ET 활성화. **빈 문자열 또는 0 이하 값 설정 시 기본값 35로 폴백** |

---

## 개발자 제공 API 키 (플랫폼 공유 키)

플랫폼 개발자가 직접 발급·등록하는 API 키. 사용자는 별도 등록 없이 사용 가능.

> ⚠️ **변수명은 이 문서가 아니라 카탈로그가 정한다.** 코드에는 개별 키 이름이 하드코딩돼 있지 않다.
> 프록시(`src/app/api/v1/proxy/route.ts`)와 `admin/keys-verify`는 `api_catalog` 행의
> **`auth_config.env_var` 값을 그대로 `process.env`에서 읽는다.** 따라서 **다른 이름으로 등록하면
> 조용히 키 없이 호출되어 401**이 난다.
>
> 2026-07-31 이전 이 표는 `DATA_GO_KR_API_KEY`·`KAKAO_REST_API_KEY`·`UNSPLASH_ACCESS_KEY`를
> 안내했으나 **이 세 이름은 코드·카탈로그 어디에서도 쓰이지 않는다**(전체 grep 0건).
> 그대로 Railway에 넣으면 동작하지 않는다.

**현재 등록해야 할 실제 이름을 확인하는 법** (하드코딩된 목록을 믿지 말 것):

```bash
node -e "const c=require('./src/data/apiCatalog.json');
for (const r of c) if (r.auth_config?.env_var)
  console.log(r.auth_config.env_var, '->', r.name, r.is_active ? '(활성)' : '(비활성)')"
```

배포 런타임에서는 `GET /api/v1/admin/keys-verify`(ADMIN_API_KEY)로 **실제 유효성**까지 확인한다.

2026-07-31 기준 `env_var`는 **24종**이며 전부 `API_KEY_*` 형식이다. 주요 항목:

| 변수 | Railway | 대상 API |
|------|---------|----------|
| `API_KEY_NASA` | ✅ (`DEMO_KEY`) | NASA 오늘의 천문 사진 — **활성 API 중 유일한 키 의존 항목** |
| `API_KEY_15B51435` | ❌ | 공휴일 정보 (한국천문연구원) · data.go.kr |
| `API_KEY_7CB8F428` / `API_KEY_00412C2B` | ❌ | 기상청 단기예보 / 중기예보 · data.go.kr |
| `API_KEY_BDA9BE95` / `API_KEY_MOLIT` | ❌ | 아파트 실거래가 / 전월세 · data.go.kr |
| `API_KEY_F1EC6F97` | ❌ | 카카오 로컬·카카오 검색 (2개 API가 **한 변수를 공유**) |
| `API_KEY_UNSPLASH` | ❌ | Unsplash — Demo 50건/시간, Production 심사 후 1,000건/시간. **사진가 Attribution 자동 삽입 필수** |
| 그 외 17종 | ❌ | OpenWeatherMap·TMDB·RAWG·TourAPI·NEIS·ECOS·HIRA·KOPIS·MFDS·TAGO·서울시 3종 등 |

> **prefix가 필요한 API는 raw 값으로 넣는다.** 카카오(`KakaoAK `)·Unsplash(`Client-ID `)의 prefix는
> 프록시의 `resolveApiKey`가 `auth_config.prefix ?? header_prefix`로 자동 적용하며,
> 값에 이미 prefix가 있으면 `startsWith` 가드로 이중 적용을 막는다. 수동으로 붙이지 말 것.

> **Open-Meteo** (날씨 API, UUID: `a3f8d2e1-7c4b-4a9f-b6e5-1d2c3f4e5a6b`)는 키 불필요 — 환경변수 등록 없이 즉시 사용 가능. 단, 비상업적 전용(CC BY 4.0): 플랫폼에 광고·구독 없을 때만 사용 가능.

---

## 배포 (플랫폼 자체 호스팅 / 서브도메인)

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `NEXT_PUBLIC_APP_URL` | ✅ | ✅ | 앱 기준 URL (예: `https://xzawed.xyz`). sitemap·관리자 인증·API 키 가이드에서 사용 |
| `NEXT_PUBLIC_ROOT_DOMAIN` | ✅ | ✅ | 서브도메인 루트 도메인 (예: `xzawed.xyz`) |

### 제거됨 · 미사용 (외부 사용자 서비스 export 스택, 2026-08-01)

아래 변수는 코드가 **더 이상 읽지 않는다.** Railway에 값이 남아 있으면 **삭제해도 된다.**
(프록시 비밀 denylist에 이름 문자열만 남아 있을 수 있음 — 동작에는 무관.)
상세: [ADR](../decisions/2026-08-01-remove-external-deploy-stack.md)

| 변수 | 상태 | 설명 |
|------|------|------|
| `GITHUB_TOKEN` | **removed/unused** | 과거 GitHub org 레포 생성·push용. 삭제 권장 |
| `GITHUB_ORG` | **removed/unused** | 과거 GitHub 조직명. 삭제 권장 |
| `RAILWAY_TOKEN` | **removed/unused** | 과거 사용자 서비스 Railway 배포용. 삭제 권장 |
| `MAX_DEPLOY_PER_DAY` | **removed/unused** | 과거 일일 외부 배포 한도. 무시됨 |

---

## 보안

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `ENCRYPTION_KEY` | ✅ | ✅ | 사용자 API 키 AES-256-GCM 암호화 키. **정확히 32바이트 권장**; 32바이트 미만 시 시작 오류, 초과 시 경고 로그 후 첫 32바이트만 사용 (`openssl rand -base64 24` → 32바이트 안전 생성) |
| `ADMIN_API_KEY` | ✅ | ✅ | 관리자 API 인증 (`/api/v1/admin/*`) |

---

## 모니터링

> ✅ **알림 sink는 Slack으로 고정했고 2026-07-31에 실경보 도착까지 검증됐다** (#220).
> 코드 경로: `errorRateMonitor`(생성 실패율) + `scheduleBackups`(SQLite 백업 실패·복구, 상태 전이 1회 경보) → `sendSlackAlert`.
> `SLACK_WEBHOOK_URL`은 Railway에 설정되어 있고 경보는 xzawed 워크스페이스 **`#alerts`** 채널로 간다.
> Sentry 관련 env(`SENTRY_DSN` 등)는 코드에 남아 있으나 미사용·미도입 결정. 값을 넣지 않는 것이 기본이다.
>
> **주의: 빈 문자열은 미설정과 같다.** `sendSlackAlert`는 `if (!webhookUrl)`로 판정하므로 키만 있고 값이 비면
> 크래시 없이 조용히 no-op이 된다(2026-07-31 이전 프로덕션이 정확히 이 상태였다).
> 확인할 때 **키 존재가 아니라 값 길이**를 볼 것.

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `SENTRY_DSN` | 선택 | ❌ | (미도입) Sentry 서버·edge DSN. #220에서 Slack-only 결정 — 설정하지 않음. 미설정 시 `enabled: false` |
| `NEXT_PUBLIC_SENTRY_DSN` | 선택 | ❌ | (미도입) Sentry 브라우저 DSN. 서버용 `SENTRY_DSN`과 별개 |
| `SENTRY_ORG` | 선택 | ❌ | (미도입) Sentry 조직 슬러그 (소스맵 업로드용) |
| `SENTRY_PROJECT` | 선택 | ❌ | (미도입) Sentry 프로젝트 슬러그 |
| `SENTRY_AUTH_TOKEN` | 선택 | ❌ | (미도입) Sentry 소스맵 업로드 토큰 |
| `SLACK_WEBHOOK_URL` | 선택 | ✅ | **활성 알림 sink (2026-07-31 설정·검증 완료).** Slack Incoming Webhook URL → xzawed 워크스페이스 `#alerts`. 미설정·**빈 문자열**이면 알림 스킵(로그 한 줄). `sendSlackAlert` ← `errorRateMonitor` + `scheduleBackups` 백업 실패/복구 |
| `ERROR_RATE_ALERT_THRESHOLD` | 선택 | ➖ | 코드 생성 실패율 알림 임계값 (기본: `5`). 5분 윈도우 내 `CODE_GENERATION_FAILED` 횟수가 이 값 이상이면 Slack 알림 1회 발송 (윈도우 내 중복 알림 방지). 인메모리·단일 인스턴스 전제. 코드 위치: `src/lib/monitoring/errorRateMonitor.ts` |
| `LOG_LEVEL` | 선택 | ➖ | 로그 상세도 임계값 (`debug`/`info`/`warn`/`error`, 기본 `info`). 이 값보다 낮은 레벨은 출력하지 않는다. 코드 위치: `src/lib/utils/logger.ts` |

---

## 비즈니스 규칙 (선택, 기본값 있음)

| 변수 | 기본값 | Railway | 설명 |
|------|--------|---------|------|
| `MAX_APIS_PER_PROJECT` | `5` | ➖ | 프로젝트당 최대 API 수 |
| `MAX_DAILY_GENERATIONS` | `10` | ➖ | 사용자당 일일 생성 횟수 |
| `MAX_DAILY_SUGGESTIONS` | `30` | ➖ | 사용자당 일일 AI 추천(suggest-*) 횟수. free 기본 30, pro 오버라이드 150. 코드: `src/lib/config/features.ts` · `RateLimitService.checkAndIncrementDailySuggestionLimit` |
| `MAX_PROJECTS_PER_USER` | `20` | ➖ | 사용자당 최대 프로젝트 수 |
| `MAX_REGENERATIONS` | `5` | ➖ | 프로젝트당 재생성 횟수 |
| `MAX_CODE_VERSIONS` | `10` | ➖ | 프로젝트당 최대 코드 버전 수. 초과 시 오래된 버전 삭제 |
| `CONTEXT_MIN_LENGTH` | `50` | ➖ | 컨텍스트 최소 길이 (자) |
| `CONTEXT_MAX_LENGTH` | `2000` | ➖ | 컨텍스트 최대 길이 (자) |
| `ANTHROPIC_TIMEOUT_MS` | `270000` | ➖ | Anthropic SDK 호출 타임아웃 (ms). Railway 300초 HTTP 컷 전 안전 종료를 위해 270초로 설정. 운영 환경에서 더 긴 응답을 허용하려면 조정 |

---

## Rate Limit (인메모리, 단일 인스턴스 전제)

| 변수 | 기본값 | Railway | 설명 |
|------|--------|---------|------|
| `RATE_LIMIT_PER_MIN` | `60` | ➖ | proxy + admin 라우트 분당 요청 한도 (사용자/IP 단위) |
| `MAX_CONCURRENT_RATE_LIMIT_USERS` | `1000` | ➖ | rate limit Map의 LRU evict 임계값 (활성 사용자/IP 한도). 초과 시 가장 오래된 항목 자동 evict — Railway 단일 인스턴스 메모리 누적 차단 |
| `SITE_PROXY_RATE_LIMIT_PER_MIN` | `20` | ➖ | 익명 게시 사이트 프록시 — IP+projectId 단위 분당 한도 |
| `SITE_PROXY_PROJECT_LIMIT_PER_MIN` | `120` | ➖ | 익명 게시 사이트 프록시 — 프로젝트 전역 분당 한도. 분산 IP로 한 오너의 API 키를 소진시키는 것을 막는 **실질 상한**. 도달 시 `logger.warn('Site proxy project limit reached')`가 버킷당 윈도 1회 남고, 사용량은 `GET /api/v1/admin/site-proxy-stats`로 확인한다. 조정 기준: [모니터링 ADR](../decisions/2026-07-29-site-proxy-abuse-monitoring.md) |
| `MAX_SITE_RATE_LIMIT_BUCKETS` | `5000` | ➖ | site 리미터가 동시에 추적하는 최대 버킷 수. 초과 시 만료 항목만 정리하고 활성 카운터는 유지(한도 우회 방지) |
| `LOGIN_IP_FAIL_LIMIT` | `10` | ➖ | 로그인 실패 per-IP 한도. 윈도우(`LOGIN_IP_WINDOW_MS`) 내 실패 횟수. 코드: `src/lib/auth/local-auth-config.ts` `authorizeWithLoginRateLimit` · `src/lib/config/rateLimit.ts` |
| `LOGIN_IP_WINDOW_MS` | `900000` (15분) | ➖ | 로그인 실패 per-IP 윈도우(ms). 짧은 시간 한도 — 장기 IP 잠금 없음 |
| `LOGIN_ACCOUNT_FAIL_LIMIT` | `5` | ➖ | 로그인 실패 per-account 한도. 버킷 키는 **제출 이메일**(trim+lowercase) — 계정 존재 여부를 노출하지 않음. 장기 계정 잠금 없음 |
| `LOGIN_ACCOUNT_WINDOW_MS` | `300000` (5분) | ➖ | 로그인 실패 per-account 윈도우(ms). 분산 stuffing 상한. 만료 후 자동 회복 |
| `MAX_AUTH_RATE_LIMIT_BUCKETS` | `10000` | ➖ | auth 인메모리 리미터(`src/lib/auth/rateLimit.ts`) 최대 버킷 수. signup·forgot-password·resend·login이 **동일 Map**을 쓴다. 초과 시 만료분만 정리하고 자리가 없으면 **신규 키 거부(과차단)** — 활성 윈도 LRU eviction 금지. 키 플러드 시 signup/forgot도 fail-closed되는 것이 의도(우회보다 안전). 용량 소진 시 `logger.warn('Auth rate limit capacity exhausted…')`가 분당 1회 |
| `RATE_LIMIT_BYPASS_USER_IDS` | `` (빈 문자열) | ➖ | 쉼표 구분 userId 목록. 포함된 계정은 일일 생성 한도(`MAX_DAILY_GENERATIONS`) 검사 스킵. 관리자·개발자 계정 우회용. 코드 위치: `src/services/rateLimitService.ts` `checkAndIncrementDailyLimit()` |
| `PROXY_CACHE_MAX_ENTRIES` | `500` | ➖ | 프록시 응답 캐시(`proxyCache`)의 LRU 최대 항목 수. 빈 문자열·숫자 아님·0 이하 값 설정 시 기본값 500으로 폴백. 인메모리·per-instance — 서버 재시작 시 초기화. 코드 위치: `src/lib/cache/proxyCache.ts` |

---

## QC

| 변수 | 기본값 | Railway | 설명 |
|------|--------|---------|------|
| `ENABLE_RENDERING_QC` | `false` | ✅ **`true` 운영 중** | Playwright 렌더링 QC 활성화. Alpine 시스템 Chromium 사용 (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`, PR #94에서 `browserPool.ts`에 executablePath 명시 전달 수정 완료) |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | `/usr/bin/chromium` | ✅ **설정됨** | Alpine 이미지 내 Chromium 실행 파일 경로. `playwright-core`는 이 환경변수를 자동으로 읽지 않으므로 `browserPool.ts`에서 `chromium.launch({ executablePath: ... })`로 명시적 전달. |
| `QUALITY_LOOP_ITERATION_TIMEOUT_MS` | `120000` | ✅ **`150000` 운영 중** | 품질 루프 반복당 타임아웃 (ms). ET 비활성 생성에 적용. 빈 문자열 또는 0 이하 값 설정 시 기본값 120000으로 폴백 |
| `QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS` | `200000` | ✅ **`200000` 운영 중** | Extended Thinking 활성 시 품질 루프 반복당 타임아웃 (ms). ET 활성 조건(API ≥ 3개 또는 컨텍스트 ≥ 500자)에서만 사용. 미설정 시 기본값 200000(200초). ET 응답은 90~150초 소요되므로 `QUALITY_LOOP_ITERATION_TIMEOUT_MS`와 별도 관리 |
| `QUALITY_LOOP_MAX_ITERATIONS` | `2` | ✅ **`2` 운영 중** | 품질 루프 최대 반복 횟수. 기본 2회 (최대 3회 상한). **현재 2회 운영 중.** 낮출수록 총 생성 시간 단축 — Railway 300초 타임아웃 초과 방지용 |
| `QUALITY_LOOP_STRICT_ADOPTION` | `true` | ➖ | 채택 가드: `true`(기본)는 한 점수 향상 + 다른 점수 동등 이상일 때만 retry 채택(시소 진동 방지). `false`로 설정 시 기존 OR 로직(한쪽 향상) 복원 — 운영 데이터 비교용 롤백 스위치 |
| `PIPELINE_MAX_DURATION_MS` | `290000` | ➖ | 파이프라인 총 허용 시간(ms). Quality Loop 시작 전 `경과 시간 + iterationTimeout > 이 값`이면 반복 스킵. Railway 300초 한도를 고려해 기본값 290초(10초 여유). 미설정 시 290000 자동 사용 |
| `GENERATION_LOCK_HEARTBEAT_MS` | `30000` | ➖ | 생성 락(`generation_locks`) 생존 신호 주기(ms). 파이프라인이 도는 동안 이 간격으로 `heartbeat_at`을 갱신한다. 0·음수·비정수는 기본값 폴백 |
| `GENERATION_LOCK_STALE_MS` | `300000` | ➖ | 이 시간 동안 heartbeat가 없으면 죽은 락으로 보고 다른 요청이 탈취한다(ms). 크래시된 파이프라인이 프로젝트를 영구히 잠그지 않게 하는 안전장치. **heartbeat 주기보다 커야 하며**, 작거나 같으면 `heartbeat × 2`로 교정하고 `logger.warn`을 남긴다 |
| `QC_QUALITY_THRESHOLD` | `60` | ➖ | 정적 QC 구조 점수 재시도 트리거 임계값. 이 값 미만이면 Quality Loop 재시도 수행 |
| `QC_MOBILE_THRESHOLD` | `60` | ➖ | 정적 QC 모바일 점수 재시도 트리거 임계값. 이 값 미만이면 Quality Loop 재시도 수행 |
| `QC_FAST_PASS_THRESHOLD` | `60` | ➖ | Fast QC 통과 기준 점수. 이 값 미만이면 Fast QC 실패로 판정 |
| `QC_DEEP_PASS_THRESHOLD` | `70` | ➖ | Deep QC 통과 기준 점수. 이 값 미만이면 Deep QC 실패로 판정 (`QC_DEEP_PASS_THRESHOLD` 환경변수로 조정 가능) |
| `QC_MAX_CONCURRENT_PAGES` | `2` | ➖ | Playwright 동시 실행 페이지 수 상한. 높일수록 처리 속도 향상이지만 메모리 증가 (Railway 유료 플랜 이상 권장). 1 이하 설정 시 기본값 2로 폴백 |
| `QC_FAST_TIMEOUT_MS` | `3000` | ➖ | Fast QC 전체 타임아웃 (ms). 초과 시 Fast QC 결과 없이 진행 |
| `QC_DEEP_TIMEOUT_MS` | `10000` | ➖ | Deep QC 전체 타임아웃 (ms). 비동기 실행이므로 생성 완료를 블로킹하지 않음 |
| `QC_CHECK_TIMEOUT_MS` | `1500` | ➖ | 개별 QC 체크(consoleErrors, horizontalScroll 등) 타임아웃 (ms) |
| `QC_PAGE_DEFAULT_TIMEOUT_MS` | `5000` | ➖ | Playwright 페이지 기본 작업 타임아웃 (ms) |
| `QC_FAST_CONTENT_TIMEOUT_MS` | `3000` | ➖ | Fast QC `page.setContent()` 타임아웃 (ms) |
| `QC_DEEP_CONTENT_TIMEOUT_MS` | `8000` | ➖ | Deep QC `page.setContent()` 타임아웃 (ms). Deep QC는 더 무거운 체크를 수행하므로 더 긴 타임아웃 필요 |

---

> **Railway 상태 업데이트 방법:** Railway 대시보드 → Variables 탭에서 실제 설정 여부 확인 후 이 파일을 갱신한다.
> Railway 상태가 변경될 때마다 이 표를 최신화하여 디버깅 시 추측을 없앤다.
>
> **최종 업데이트:** 2026-06-24 (공개 다중 사용자 인증 — ADMIN_EMAIL/ADMIN_PASSWORD_HASH/ADMIN_USER_ID/ADMIN_NAME 제거, RESEND_API_KEY/EMAIL_FROM 추가)
