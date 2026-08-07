# API v1 엔드포인트 레퍼런스

> **언제 읽나**: 라우트를 추가·변경할 때, 또는 **어떤 엔드포인트가 무슨 인증·레이트리밋을 요구하는지** 알아야 할 때

> ⚠️ **이 문서는 요청·응답 JSON을 서술하지 않는다.** 스키마는 코드가 진실원이고, 문서에
> 복제하면 아무도 검증하지 않아 조용히 썩는다. 2026-08-07 감사 실측: 이 문서가 나열하던
> 에러 코드 15개 중 **4개**(`CONTEXT_TOO_SHORT`·`CONTEXT_TOO_LONG`·`MAX_APIS_EXCEEDED`·
> `DEPLOY_FAILED`)가 `src/` 어디에도 없는 허구였다.
> 여기 남은 것은 **코드를 열어도 빨리 알 수 없는 것**뿐이다 — 인증·한도 한 눈 표, 라우트 파일
> 포인터, 그리고 착각하면 사고가 나는 계약상 함정.

---

## 0. 공통 규약

- **Base URL**: 개발 `http://localhost:3000/api/v1` · 프로덕션 `https://xzawed.xyz/api/v1`
- **응답 래퍼** — `{ success: true, data: T }` / `{ success: false, error: { code, message } }`.
  변환은 `handleApiError()`(`src/lib/utils/errors.ts`) 단일 출처. **예외는 §3에 열거**되어 있고, 그 예외들이 실제로 사고를 냈다.
- **에러 코드 전체 목록은 [error-codes.md](error-codes.md)가 진실원**이다. 여기엔 그쪽에 없는 라우트 로컬 코드만 §4에 적는다.
- **요청 본문 스키마는 §2**를 볼 것. 필드 목록을 이 문서에 복제하지 않는다.

---

## 1. 엔드포인트 — 경로 · 인증 · 레이트리밋 · 라우트 파일

인증 표기:
`공개` = 무인증 · `세션` = `getAuthUser()` · `세션+인증메일` = `getAuthUser()` + `assertEmailVerified()`(`src/lib/auth/verifiedGuard.ts`) ·
`세션+소유권` = + `assertOwner()` · `관리자` = `Authorization: Bearer {ADMIN_API_KEY}`(`verifyAdminKey`).

> **`세션+인증메일`은 생성·추천 6개에만 걸려 있다.** 게시(`publish`)에는 **없다** — 이 문서가
> 예전에 "이메일 미인증(생성·**배포** 등)"이라 적어 두었던 것은 틀렸다(2026-08-07 코드 확인).

### 1.1 카탈로그 · 국가 데이터 (전부 공개)

| 경로 | 메서드 | 인증 | 레이트리밋 | 라우트 파일 |
|---|---|---|---|---|
| `/api/v1/catalog` | GET | 공개 | 없음 | `src/app/api/v1/catalog/route.ts` |
| `/api/v1/catalog/:id` | GET | 공개 | 없음 | `src/app/api/v1/catalog/[id]/route.ts` |
| `/api/v1/catalog/categories` | GET | 공개 | 없음 | `src/app/api/v1/catalog/categories/route.ts` |
| `/api/v1/countries` | GET·OPTIONS | 공개 | 없음 | `src/app/api/v1/countries/route.ts` |
| `/api/v1/countries/:code` | GET·OPTIONS | 공개 | 없음 | `src/app/api/v1/countries/[code]/route.ts` |

국가 데이터는 생성 사이트가 프록시 없이 직접 부를 수 있도록 CORS `*` + `Cache-Control: public, max-age=86400`.
**표준 래퍼가 없다** — §3 참조. 배경: [등록 ADR](../decisions/2026-06-22-catalog-registration-and-seed-resync.md)

### 1.2 프로젝트

| 경로 | 메서드 | 인증 | 레이트리밋 | 라우트 파일 |
|---|---|---|---|---|
| `/api/v1/projects` | GET·POST | 세션 | 없음 | `src/app/api/v1/projects/route.ts` |
| `/api/v1/projects/:id` | GET·DELETE | 세션 | 없음 | `src/app/api/v1/projects/[id]/route.ts` |
| `/api/v1/projects/:id/rollback` | POST | 세션+소유권 | 없음 | `src/app/api/v1/projects/[id]/rollback/route.ts` |
| `/api/v1/projects/:id/publish` | POST·DELETE | 세션 | 없음 | `src/app/api/v1/projects/[id]/publish/route.ts` |
| `/api/v1/projects/:id/slug/check` | POST | 세션+소유권 | 없음 | `src/app/api/v1/projects/[id]/slug/check/route.ts` |
| `/api/v1/preview/:projectId` | GET | 세션+소유권 | 없음 | `src/app/api/v1/preview/[projectId]/route.ts` |
| `/api/v1/user-api-keys` | GET·POST·DELETE | 세션 | 없음 | `src/app/api/v1/user-api-keys/route.ts` |

- 최초 게시 시 `slug` 직접 지정 가능, 미제공 시 자동 생성. **재게시는 기존 slug 유지.** 충돌 시 `-2`·`-3` suffix.
- `slug/check`의 `reason`: `invalid`(형식·예약어) / `reserved` / `taken`.
- 미리보기는 `?version=` 으로 과거 버전 조회. 1 미만·비정수는 400.

### 1.3 생성 · AI 추천

| 경로 | 메서드 | 인증 | 레이트리밋 | 라우트 파일 |
|---|---|---|---|---|
| `/api/v1/generate` | POST | 세션+인증메일 | 일일 생성 `MAX_DAILY_GENERATIONS`(기본 10) | `src/app/api/v1/generate/route.ts` |
| `/api/v1/generate/regenerate` | POST | 세션+인증메일 | 동일 일일 생성 한도 | `src/app/api/v1/generate/regenerate/route.ts` |
| `/api/v1/generate/status/:projectId` | GET | 세션 | 없음 | `src/app/api/v1/generate/status/[projectId]/route.ts` |
| `/api/v1/suggest-apis` | POST | 세션+인증메일 | 일일 추천 `MAX_DAILY_SUGGESTIONS`(기본 30) | `src/app/api/v1/suggest-apis/route.ts` |
| `/api/v1/suggest-context` | POST | 세션+인증메일 | 동일 일일 추천 한도 | `src/app/api/v1/suggest-context/route.ts` |
| `/api/v1/suggest-modification` | POST | 세션+소유권+인증메일 | 동일 일일 추천 한도 | `src/app/api/v1/suggest-modification/route.ts` |
| `/api/v1/suggest-preferences` | POST | 세션+인증메일 | 동일 일일 추천 한도 | `src/app/api/v1/suggest-preferences/route.ts` |

- 한도 기본값의 진실원은 `src/lib/config/features.ts`(env override). **실패 시 `charged===true`일 때만 환불**한다.
- 재생성은 프로젝트당 `maxRegenerationsPerProject`(기본 5회)이며 **일일 생성 횟수에도 포함**된다.
- 추천 4종은 전부 `createForTask('suggestion')`(Haiku)를 써야 한다. 기본 팩토리를 쓰면 조용히 단가가 오른다.

**SSE 계약** (`generate`·`regenerate`): 이벤트 이름 `progress`(`{progress, message}`) / `complete`(`{projectId, version, previewUrl}`) / `error`(`{message}`).
스트림이 끊기면 클라이언트가 `generate/status/:projectId`로 폴백 폴링한다 —
폴링 상태 union과 클라이언트 처리는 `src/lib/generation/pollGenerationStatus.ts`.

`status` 값: `generating` / `completed` / `failed` / `not_found`.
> **소유권이 다른 사용자가 조회해도 `not_found`를 준다** — 403이면 "그 프로젝트가 존재한다"가 새기 때문이다. 이건 버그가 아니라 의도다.

**킬스위치·락 (한도 차감 순서가 계약이다)**

| 상태 | 코드 | 의미 |
|---|---|---|
| 503 | `GENERATION_DISABLED` | `enable_generation` off. **일일 한도 차감 이전**에 반환 |
| 409 | `GENERATION_IN_PROGRESS` | `acquireGenerationLock` 실패(DB 락). **차감분 환불됨** |

플래그 조회는 `src/lib/config/featureFlags.ts`(10초 캐시·fail-open). 중복 차단은 tracker가 아니라 **DB 락**이다 —
tracker로 겸했을 때 TTL 만료로 락이 사라져 Opus/ET 이중 청구가 났다. [ADR](../decisions/2026-07-29-durable-generation-lock.md)

### 1.4 인증 (Auth)

Auth.js v5 Credentials + JWT(무상태 세션 쿠키). 로그인 핸들러는 `src/app/api/auth/[...nextauth]/route.ts`.

| 경로 | 메서드 | 인증 | 레이트리밋 | 라우트 파일 |
|---|---|---|---|---|
| `/api/auth/*` | GET·POST | 공개 | 로그인 실패: IP 10회/15분 · 계정 5회/5분 | `src/app/api/auth/[...nextauth]/route.ts` |
| `/api/v1/auth/signup` | POST | 공개 | IP 5회/시간 | `src/app/api/v1/auth/signup/route.ts` |
| `/api/v1/auth/verify-email` | POST | 공개(토큰 자체가 인가) | 없음 | `src/app/api/v1/auth/verify-email/route.ts` |
| `/api/v1/auth/resend-verification` | POST | 세션 | 사용자 3회/시간 | `src/app/api/v1/auth/resend-verification/route.ts` |
| `/api/v1/auth/forgot-password` | POST | 공개 | IP 5회/시간 | `src/app/api/v1/auth/forgot-password/route.ts` |
| `/api/v1/auth/reset-password` | POST | 공개(토큰 자체가 인가) | 없음 | `src/app/api/v1/auth/reset-password/route.ts` |
| `/api/v1/auth/status` | GET | 세션 | 없음 | `src/app/api/v1/auth/status/route.ts` |
| `/api/v1/auth/export` | GET | 세션 | 사용자 3회/시간 | `src/app/api/v1/auth/export/route.ts` |
| `/api/v1/auth/account` | DELETE | 세션 + **비밀번호 재인증** | 사용자 5회/시간 | `src/app/api/v1/auth/account/route.ts` |

한도 상수의 진실원은 `src/lib/config/rateLimit.ts`, 적용 헬퍼는 `enforceRateLimit`(`src/lib/auth/routeHelpers.ts`).
로그인 스로틀의 설계 제약(계정 버킷은 **제출된 이메일**로 키를 잡는다·한도 초과 시 `return null`)은
[로그인 레이트리밋 ADR](../decisions/2026-07-30-login-rate-limit.md).

**깨면 조용히 사고 나는 것들**

- `signup` 503 `SIGNUP_DISABLED`는 **레이트리밋 이전**에 반환한다. 신규 가입만 막고 기존 사용자는 무영향.
- `forgot-password`는 **계정 존재 여부와 무관하게 동일 응답**이다(enumeration 방지). 응답을 분기시키지 말 것.
- `export`는 **`passwordHash`·`auth_tokens`·`generation_locks`·`user_daily_limits`·API 키 ciphertext/평문을 절대 포함하지 않는다.**
  `userApiKeys`는 메타데이터만. 필드를 추가할 때 이 목록을 먼저 볼 것.
- `account` DELETE는 **단일 SQLite 트랜잭션**(`src/lib/auth/deleteAccountCascade.ts`)이고, 감사 로그(`platform_events`)는
  행을 보존한 채 `user_id` 분리 + payload 익명화한다. 이벤트 payload 키는 **`deletedUserId`** — `userId`로 쓰면
  persist가 FK를 붙이려다 방금 지운 행을 참조한다. 세션 쿠키는 `Max-Age=0`.
  배경: [계정 삭제·내보내기 ADR](../decisions/2026-07-30-account-delete-and-export.md) · [#221](https://github.com/xzawed/CustomWebService/issues/221)

### 1.5 프록시 · 공개 서빙 · 헬스

| 경로 | 메서드 | 인증 | 레이트리밋 | 라우트 파일 |
|---|---|---|---|---|
| `/api/v1/proxy` | GET·POST | **모드별** (§5) | 모드별 (§5) | `src/app/api/v1/proxy/route.ts` |
| `/site/:slug` | GET | 공개 | 없음 | `src/app/site/[slug]/route.ts` |
| `/api/v1/health` | GET | 공개 / `?detailed=true`는 관리자 | detailed 요청만 IP 60회/분 | `src/app/api/v1/health/route.ts` |
| `/api/v1/popular-services` | GET | 세션 | 없음 | `src/app/api/v1/popular-services/route.ts` |

**`/site/:slug`** — 서브도메인 rewrite의 착지점. 미게시 상태는 404가 아니라 **HTTP 200 + "준비 중" 안내 페이지**다
(존재하지 않는 slug만 404). 헤더는 `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` + CSP + `X-Frame-Options: DENY`.
CSP 문자열의 소유자는 이 라우트가 아니라 `src/lib/constants/cdn.ts`다.

**`/api/v1/health`** — 기본은 `{status, timestamp}`만. `?detailed=true` + `ADMIN_API_KEY`면 `checks`·`usage`가 붙는다.
`status`(상세): `healthy`(`checks.database=ok` **이고** `checks.ai=ok`) / `degraded`(AI 미설정·불가) / `unhealthy`(DB 연결 실패).

> ⚠️ **한도 초과는 `429` + `status: "rate_limited"`이고, 공개 응답(`status: "ok"`)으로 폴백하지 않는다.**
> 폴백시키면 올바른 키를 가진 관리자가 한도 초과를 "정상"으로 오인한다 — 인시던트 런북이
> `?detailed=true`를 반복 호출하는 경로라 실제 위험이다. `checkAdminAuth()`가 `rate_limited`를
> `unauthorized`와 구분해 반환하는 이유가 이것이다(`src/lib/utils/adminAuth.ts`).

### 1.6 관리자 (전부 `Authorization: Bearer {ADMIN_API_KEY}` + per-IP 60회/분)

per-IP 한도는 `verifyAdminKey`가 **키 검사보다 먼저** 적용한다(브루트포스 방어). 전 라우트에 `OPTIONS` 프리플라이트 있음.

| 경로 | 메서드 | 라우트 파일 |
|---|---|---|
| `/api/v1/admin/qc-stats` | GET | `src/app/api/v1/admin/qc-stats/route.ts` |
| `/api/v1/admin/trigger-qc` | POST | `src/app/api/v1/admin/trigger-qc/route.ts` |
| `/api/v1/admin/test-generation` | POST | `src/app/api/v1/admin/test-generation/route.ts` |
| `/api/v1/admin/backup/latest` | GET | `src/app/api/v1/admin/backup/latest/route.ts` |
| `/api/v1/admin/debug` | GET | `src/app/api/v1/admin/debug/route.ts` |
| `/api/v1/admin/keys-verify` | GET | `src/app/api/v1/admin/keys-verify/route.ts` |
| `/api/v1/admin/catalog/activate` | POST | `src/app/api/v1/admin/catalog/activate/route.ts` |
| `/api/v1/admin/catalog/deactivate` | POST | `src/app/api/v1/admin/catalog/deactivate/route.ts` |
| `/api/v1/admin/catalog-dump` | GET | `src/app/api/v1/admin/catalog-dump/route.ts` |
| `/api/v1/admin/verify-catalog` | POST | `src/app/api/v1/admin/verify-catalog/route.ts` |
| `/api/v1/admin/feature-flags` | GET·POST | `src/app/api/v1/admin/feature-flags/route.ts` |
| `/api/v1/admin/site-proxy-stats` | GET | `src/app/api/v1/admin/site-proxy-stats/route.ts` |

각 엔드포인트가 **왜 있는지·무엇을 착각하면 안 되는지**는 §6.

---

## 2. 요청 본문 스키마 — 어디를 보나

**`src/types/schemas.ts` 가 요청 본문 Zod 스키마의 단일 출처다.** 이름이 엔드포인트와 1:1로 대응한다
(`createProjectSchema`·`generateSchema`·`regenerateSchema`·`slugCheckSchema`·`rollbackSchema`·`saveKeySchema`·
`suggest*Schema`·`signupSchema`·`forgotPasswordSchema`·`verifyEmailSchema`·`resetPasswordSchema`·
`triggerQcSchema`·`setFeatureFlagSchema`·`activateCatalogSchema`·`deactivateCatalogSchema`).
필드·길이 제한을 이 문서에 복제하지 않는다 — 스키마가 바뀌면 문서만 남고 거짓이 된다.

> ⚠️ **예외 2개는 `schemas.ts`에 없다.** grep해도 안 나오니 라우트 파일을 직접 열 것.
> - 계정 삭제 `{ password }` → `src/app/api/v1/auth/account/route.ts` 내 인라인 `deleteAccountSchema`
> - 관리자 생성 테스트 → `src/app/api/v1/admin/test-generation/route.ts` 내 인라인 `bodySchema`

`templateId`의 허용값 union은 `src/types/project.ts`. 프록시 쿼리(`apiId`·`proxyPath`·`projectId`)는 `src/app/api/v1/proxy/route.ts`에서 검증한다.

---

## 3. 계약상 함정 — 착각하면 조용히 잘못 동작한다

| 함정 | 실제 동작 |
|---|---|
| **`data`가 객체냐 배열이냐** | `GET /catalog` 은 **`data: { items, total, page, totalPages }`**(페이지네이션 객체). 반면 `GET /catalog/categories`·`GET /projects`는 **`data: [...]`**(맨 배열). `data`를 배열로 가정한 코드는 카탈로그에서 조용히 빈 배열을 얻는다 |
| **`/countries`에는 래퍼가 없다** | `{success,data}` 없이 `Country[]` / `Country`를 그대로 반환한다. 404도 `{ error: "..." }` 형태로 표준 코드가 아니다 |
| **`qcWarnings`는 조건부 필드** | `POST /projects/:id/publish` 응답의 `qcWarnings`는 렌더링 QC(`ENABLE_RENDERING_QC=true`)에서 경고가 났을 때**만** 붙는다. 경고가 없으면 **필드 자체가 없다** — `length === 0` 검사로 판단하면 안 된다 |
| **알 수 없는 `templateId`는 400이 아니다** | `generateSchema`의 `templateId`는 enum이 아니라 `z.string()`이고, 라우트는 `templateRegistry.get(templateId)?.generate(...)`로 옵셔널 체이닝한다. 오타는 **에러 없이 무시**되고 템플릿 힌트만 사라진다 |
| **`generate/status`의 `not_found`** | 미존재와 **소유권 불일치**가 같은 값이다. 403이 아니라 `not_found`인 것이 의도(존재 여부 누출 방지) |
| **미게시 사이트는 200이다** | `/site/:slug`는 미게시일 때 404가 아니라 200 + 안내 페이지. "200이니 게시됐다"로 판단 금지 |
| **`health` 429는 `ok`로 폴백하지 않는다** | §1.5 참조 |
| **레거시 `{ error: "문자열" }` 패턴** | 일부 수동 catch가 `error`를 문자열로 반환하던 시절이 있다. 신규 라우트는 반드시 `handleApiError()` — 상세는 [error-codes.md](error-codes.md) |

---

## 4. 라우트 로컬 에러 코드 (error-codes.md 미등재분)

**공통 에러 코드·클래스·HTTP 매핑의 진실원은 [error-codes.md](error-codes.md)다.** 아래 2개는 그 문서에 아직 없다.

| 코드 | HTTP | 발생 위치 | 설명 |
|---|---|---|---|
| `GENERATION_IN_PROGRESS` | 409 | `generate`, `regenerate` | DB 생성 락 획득 실패. **일일 한도 차감분 환불됨** |
| `SERVICE_UNAVAILABLE` | 503 | `admin/backup/latest` | 백업 디렉터리 읽기 실패 (백업 파일 부재는 404 `NOT_FOUND`) |

> **판단 필요**: 위 2개를 [error-codes.md](error-codes.md)로 옮기는 편이 옳지만, 그 파일은 이번 작업 범위 밖이라 손대지 않았다.

---

## 5. 프록시 — 모드 · 한도 · 캐시 키

### 5.1 인가 모드 (단일 진입점)

인가 판정은 `resolveProxyContext()`(`src/lib/proxy/resolveProxyContext.ts`) **한 곳**에 있다.
라우트에 인가 분기를 새로 만들지 말 것 — 판단이 흩어져 개인 키 해석부가 소유권을 확인하지 않던 것이 H-1이었다.

| 모드 | 판정 조건 | 인증 | 키 주입 |
|---|---|---|---|
| **site** (게시 사이트) | 요청 Host가 게시된 서브도메인(`slug.xzawed.xyz`)으로 해석됨 | **익명 허용** — 방문자는 로그인하지 않는다 | **프로젝트 오너의 개인 키**를 서버가 주입 |
| **app** (대시보드·미리보기) | 그 외 (apex 도메인) | 세션 필수(미인증 401) + **소유권 강제**(`assertOwner`) | 요청자 본인 키 |

> **site 모드에서 Host가 프로젝트를 확정하면 클라이언트가 보낸 `projectId`는 무시된다.** 조회 실패는 404로 fail-closed.
> 익명 요청이 오너의 키로 업스트림을 호출하므로 캐시 키에 키 신원이 반드시 들어가야 한다(§5.3).
> 배경: [게시 사이트 프록시 인가 ADR](../decisions/2026-07-28-published-site-proxy-authz.md)

SSRF 방지: 등록된 `baseUrl` 범위 내에서만 요청 허용, 사설 IP·루프백 차단.
키 prefix(`auth_config.prefix`/`header_prefix`)는 `resolveApiKey`가 주입 시 적용한다(이중 적용 가드 있음).

### 5.2 레이트리밋

| 모드 | 한도 | 비고 |
|---|---|---|
| app | 사용자당 분당 60회 | 인메모리, 초과 시 429 |
| site | **방문자 IP당 분당 20회** + **프로젝트 전역 분당 120회** | 프로젝트 한도가 분산 IP로도 우회되지 않는 실질 상한 |

상수는 `src/lib/config/rateLimit.ts`, site 리미터 구현은 `src/lib/proxy/siteRateLimit.ts`.
프로젝트 전역 한도 도달 시 `logger.warn('Site proxy project limit reached')`가 **버킷당 윈도 1회**만 남는다(봇이 두드릴 때 로그 폭발 방지).
인메모리라 재시작 시 초기화되며 단일 인스턴스를 전제한다.

> 기본값 20/120은 **실사용 데이터 없이 정한 값**이다. 임의로 바꾸지 말고 `GET /api/v1/admin/site-proxy-stats`
> 지표를 근거로 바꿀 것 — 조정 판단 기준표가 [오남용 모니터링 ADR](../decisions/2026-07-29-site-proxy-abuse-monitoring.md)에 고정돼 있다.

### 5.3 응답 캐시와 캐시 키 신원

`cache_ttl_seconds`가 설정된 API의 **GET** 응답만 서버 메모리에 캐시된다. POST·4xx/5xx·`cache_ttl_seconds=null`은 캐시하지 않는다.
응답 헤더 `X-Cache: HIT|MISS`, `Cache-Control: public, max-age={ttl}` 또는 `no-store`.

> **캐시 키: `apiId:proxyPath:sortedParams:keyIdentity`** — 네 번째 인자는 `buildCacheKey()`에서
> **선택이 아니라 필수**다(`src/lib/cache/proxyCache.ts`). 서버 주입 인증 파라미터는 키에서 제외한다.
>
> `keyIdentity`는 실제로 주입된 키의 `keyFingerprint()`(sha256 앞 16자)이고, 주입이 없으면
> `NO_KEY_IDENTITY`(`'none'`)다. **원문 키를 넣지 않는다** — 캐시 키는 로그·디버깅에 노출될 수 있다.
>
> ⚠️ **이 인자를 빼면 교차 테넌트 유출이 돌아온다.** site 모드가 익명 방문자 요청을 오너의
> 개인 키로 호출하므로, 키가 다르면 캐시 항목도 달라야 한다. 플랫폼 키에도 지문을 쓰며
> (동작 동일 + 키 교체 시 자동 무효화), 응답 본문은 여전히 메모리에 평문이므로 민감 데이터 API에
> `cache_ttl_seconds`를 부여할 때는 별도 검토가 필요하다.
> 배경: [프록시 캐시 키 신원 ADR](../decisions/2026-07-29-proxy-cache-key-identity.md)

---

## 6. 관리자 API — 왜 있는가 · 무엇을 착각하면 안 되는가

응답 스키마는 §1.6의 라우트 파일에 있다. 아래는 **파일을 읽어도 안 나오는 것**만이다.

### `GET /admin/qc-stats`
`?days=`(기본 7). **비율의 분모가 지표마다 다르다** — `realSuccessRate`·`stage3FallbackRate`는
**시도**(`totalGenerations + failureCount`), `stage2SkipRate`·`stage3SkipRate`는 **완료**(`totalGenerations`),
`avgRenderingQcScore`·`qcPassRate`는 **QC를 실제로 돈 건수**(`qcCount`)다. 같은 분모로 읽으면 결론이 틀어진다.
집계 메서드는 DB 오류를 throw하므로 **장애가 0-메트릭으로 은폐되지 않고** 500으로 드러난다.

### `POST /admin/trigger-qc`
수동 QC 실행. `ENABLE_RENDERING_QC=true` 필요(아니면 400 `QC_DISABLED`).

### `POST /admin/test-generation`
**세션 없이 `ADMIN_API_KEY`만으로 전체 생성 파이프라인을 1회 돌린다. 실제 AI 비용이 발생하고,
일일 생성 한도·프로젝트 수 한도를 우회한다.** 일반 사용자 흐름 검증용이 아니라 안정성 측정용이다.
파이프라인 실패는 **HTTP 200 + `success: false`**로 온다(전송 실패와 구분하기 위함) — 200을 성공으로 읽지 말 것.
`cleanup`은 기본 `true`(완료 후 프로젝트 자동 삭제).
반복 호출 스크립트: [scripts/runGenerationLoadTest.ts](../../scripts/runGenerationLoadTest.ts)

### `GET /admin/backup/latest`
가장 최근 on-volume SQLite `.backup()` 덤프를 octet-stream으로 내려받는다.
**전체 DB**(사용자·비밀번호 해시·암호화 API 키·생성 코드)이므로 성공 시 감사 `logger.warn` + Slack info가 나간다.
**클라이언트 파일명 파라미터를 받지 않는다**(서버가 백업 디렉터리에서 패턴 매칭으로만 선택) — 경로 조작 차단.
볼륨 손실 대비의 **유일한 무료 오프-볼륨 경로**이고 자동화·강제 스케줄은 없다.
계층·근거: [operations.md §3.4](../guides/operations.md) · 시임 `SQLITE_OFFSITE_BACKUP_URL`([env-vars.md](env-vars.md))

### `GET /admin/debug`
모듈 로드 상태 + **AI 모델 해석 결과**.

> **`models`를 왜 보는가**: 허용목록(`ALLOWED_CLAUDE_MODELS`)에 없는 env 값은 경고 로그 한 줄만 남기고
> **조용히 기본값으로 폴백**한다. env 값만 봐서는 실제 적용 모델을 알 수 없어, 2026-07-10에
> `AI_MODEL_GENERATION`이 밀려 구모델로 돌던 것을 뒤늦게 발견했다.
> **모델을 바꾼 뒤에는 이 엔드포인트로 `models.<task>.fellBack === false`를 확인할 것.**
> `fellBack: true`면 `AiProviderFactory.ts`의 허용목록을 고쳐야 한다.

`offsiteBackup.configured`는 설정 여부만 알려준다 — **URL 원문은 응답에 절대 포함되지 않는다.**

### `GET /admin/keys-verify`
"플랫폼 키 의존" API(`auth_type=api_key` + `auth_config.env_var`, `default_key` 없음)에 **실제 인증 요청을 보내** 키를 검증한다.
검증 로직: `src/lib/catalog/keyCheck.ts`. 키 값은 응답에 노출되지 않는다.

> **Railway sealed 변수는 배포 런타임에만 주입된다 — 이 진단은 반드시 배포 환경에서 실행돼야 한다**
> (로컬 `railway run`은 sealed 미주입). 기본은 **활성 API만** 보므로, 활성화 **전**에 키를 검사하려면
> `?includeInactive=true`가 필요하다.
>
> ⚠️ **`VALID`는 "동작한다"가 아니다.** 키가 주입되고 인증이 하드 실패하지 않았다는 뜻뿐이다.
> 기능 정상성 판정은 `looksLikeErrorBody`를 포함하는 `src/lib/catalog/healthCheck.ts` 쪽이다.
> 이 혼동으로 두 번 사고가 났다(REST Countries 2026-06-21, data.go.kr 4종 2026-08-05).
> [카탈로그 헬스 모니터링 ADR](../decisions/2026-06-21-api-catalog-health-monitoring.md)

- `verdict`: `VALID` / `INVALID`(키 거부·만료) / `MISSING`(env 미설정) / `RATE_LIMITED` / `ERROR` / `NO_ENDPOINT`
- `summary.activatable`: 비활성 + `VALID`인 `apiId` 목록 — `POST /admin/catalog/activate`에 그대로 넘길 수 있다
- `summary.needsPrefixFix`: raw 주입은 401인데 prefix(`KakaoAK `·`Client-ID `) 적용 시 성공한 API — **프록시가 prefix를 적용해야 한다는 뜻**

### `POST /admin/catalog/activate`
비활성 "플랫폼 키 의존" API를 **라이브 키 검증이 `VALID`인 것만** 켠다.
검증 없이 `is_active`를 올리면 키 오류 API가 사용자에게 노출되므로, **활성화 전제를 검증 통과로 못박은 것**이다.
`apiIds` 생략·빈 배열이면 비활성 키 의존 API 전부가 대상. `dryRun: true`로 먼저 후보를 확인하고 켠다.
성공 시 `isActive=true` + `verificationStatus='verified'` + `CATALOG_API_ACTIVATED` 이벤트.

### `POST /admin/catalog/deactivate`
**activate와 대칭이 아니다 — 의도적이다.**

- `apiIds` **필수**(생략·빈 배열 불가). "omit=전부 끔"은 구현하지 않았다 — 실수로 카탈로그 전체를 끄는 동작이 없어야 한다
- **라이브 키 검증을 하지 않는다.** 업스트림 장애·키 만료 상황에서도 즉시 꺼야 하기 때문
- 성공 시 `isActive=false` **만** 쓴다. `verificationStatus`는 **보존** — "왜 껐는지" 증거를 남긴다
- 미존재 ID·이미 비활성은 예외가 아니라 `deactivated: false` + 사유로 돌아온다

> **주의**: `CORRECTIONS`(Dog API·Lorem Picsum) 2건은 매 부팅 `ensureCatalog`가 `is_active=true`로 되돌린다.
> **이 둘만은 deactivate가 유지되지 않는다.**

### `POST /admin/verify-catalog`
활성 카탈로그의 GET 엔드포인트를 배포 런타임에서 실제 호출해 `verification_status`를 갱신한다
(컷오버로 제거된 CI cron의 대체). 로직: `src/lib/catalog/verifyRunner.ts`.

- `health`: `working` / `degraded`(느림·429) / `broken`(네트워크 실패·5xx·키리스 401·2xx 에러본문) / `key_gated`(키 의존 401/403) / `unknown`(예상치 못한 4xx)
- **`key_gated`·`unknown`은 기존 값을 보존한다** — 일시 장애·키 부재로 정상 API를 `broken`으로 오판하는 것을 막기 위함. `skipped`로 집계된다
- `working/degraded → verified`, `broken → broken`만, 그리고 **현재 값과 다를 때만** DB를 쓴다
- 무인 스케줄러가 아니라 **관리자 트리거**다 — 플래핑·무인 outbound가 없다

`verification_status` 소비 규칙(AI 추천은 `broken` 제외·`verified` 우선, 브라우징 `search()`는 숨기지 않음):
[소비 ADR](../decisions/2026-06-22-verification-status-consumption.md)

### `GET /admin/catalog-dump`
`api_catalog` **전체 행(비활성 포함)** 을 시드 diff용으로 덤프한다. 공개 `GET /api/v1/catalog`는 **활성 행만**
주므로 파리티 검증에 쓸 수 없다. `auth_config` 등 민감 필드를 제외한 **안전 투영**만 반환하는 읽기 전용 진단.

### `GET|POST /admin/feature-flags`
env 변경(재배포)을 기다리지 않고 DB 값으로 생성·가입을 즉시 막는 킬스위치.

| 플래그 | 기본(시드) | 효과 |
|---|---|---|
| `enable_generation` | `true` | false → generate/regenerate `503 GENERATION_DISABLED` |
| `enable_signup` | `true` | false → signup `503 SIGNUP_DISABLED` (기존 사용자 무영향) |

> **알려진 플래그만 허용한다**(`setFeatureFlagSchema`의 zod enum). 오타로 만들어진 행은 아무도 읽지 않으면서
> **"스위치를 내렸다"는 착각만 남긴다** — 인시던트 중엔 그게 제일 위험하다.

읽기는 인프로세스 10초 캐시 · **fail-open**(행 없음·DB 오류 시 enabled). 쓰기 후 캐시 무효화 +
`FEATURE_FLAG_CHANGED` 이벤트 + 감사 `logger.warn`. 절차: [operations.md §4.4](../guides/operations.md)

### `GET /admin/site-proxy-stats`
`?limit=`(기본 50, 0·음수·비정수는 기본값 폴백). site 모드는 익명 방문자가 **오너의 API 키로** 업스트림을
호출하므로 레이트리밋이 유일한 방어선인데, 한도 초과가 429로만 나타나 어느 프로젝트가 소진 중인지 알 수 없었다.

| 필드 | 해석 |
|---|---|
| `blockedByIp` | IP+projectId 버킷(20/분). 한 방문자의 과속 — **정상 트래픽에서도 나온다** |
| `blockedByProject` | 프로젝트 전역 버킷(120/분). 분산 IP로도 우회 불가한 실질 상한이라 **0이 아니면 오남용 또는 한도 부족** |
| `truncated` | 추적 용량(`MAX_SITE_RATE_LIMIT_BUCKETS`) 초과로 집계에서 빠진 프로젝트가 있음 |
| `returnedProjects` vs `trackedProjects` | 다르면 `limit`으로 잘린 상위 N개만 본 것 |

집계는 인메모리라 **프로세스 재시작 시 초기화**된다. `since`가 집계 시작 시각이다.

---

## 7. 제거된 것 — 다시 만들지 말 것

- **`POST /api/v1/deploy`** 및 외부 배포 스택(GitHub org 레포 / Railway·GitHub Pages export)은 2026-08-01 제거됐다.
  제품의 배포 스토리는 **게시(publish) → `slug.xzawed.xyz`** 다.
  [ADR](../decisions/2026-08-01-remove-external-deploy-stack.md)
- `health` 상세 응답의 `failover` 필드는 SQLite 컷오버로 제거됐다. **배포 서비스 검사도 없다.**
