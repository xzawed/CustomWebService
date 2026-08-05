# 시스템 명세 (SDD) — 불변조건과 계약

> **언제 읽나**: 불변조건을 바꾸거나 새로 만들 때. 프록시 인가·캐시 키 신원·XFF·로그인 스로틀·WAL 체크포인트·삭제 캐스케이드처럼 **깨지면 조용히 사고 나는 규칙**의 원본이 여기에 있다 — `CLAUDE.md`의 요약본만 보고 고치지 말 것

> **이 문서의 역할**: 구조 설명이 아니라 **"무엇이 참이어야 하는가"**를 모은 규범 계층이다.
> 구조·흐름은 [overview.md](overview.md)·[database.md](database.md)·[ai-pipeline.md](ai-pipeline.md)·
> [auth.md](auth.md)·[events.md](events.md)·[subdomain.md](subdomain.md)에 있고, 여기서는 반복하지 않는다.
>
> **작성 근거**: 2026-07-31 전수 감사. 각 항목은 코드에서 확인한 뒤 **적대적 재검증을 통과한 것만** 남겼다
> (검증에서 기각된 주장 13건은 제외). 근거 파일은 그대로 인용하되, 줄 번호는 시간이 지나면 어긋나므로
> **파일과 함수 이름을 기준으로 찾을 것**.

---

## 이 문서를 읽는 법

각 불변조건은 **"깨지면 무슨 일이 일어나는가"**를 함께 적었다. 그게 이 문서의 존재 이유다 —
규칙만 있으면 다음 작업자가 "이건 과한 것 같은데"라고 판단하고 되돌린다.

특히 아래 표시가 붙은 항목은 **조용히 깨진다**. 테스트도 CI도 잡지 못하고 프로덕션에서만 드러난다.

> 🔇 = 조용히 깨진다 (예외·에러 없이 잘못된 결과를 낸다)

---

## 1. 보안·격리

### 1.1 🔇 프록시 캐시 키에는 키 신원이 반드시 들어간다

`buildCacheKey(apiId, proxyPath, params, keyIdentity)` — **4번째 인자는 선택이 아니라 필수**다
(`src/lib/cache/proxyCache.ts`). 조회와 저장이 같은 키를 써야 한다.

- `keyIdentity` = 실제 주입된 키의 `keyFingerprint()`(sha256 앞 16자), 주입이 없으면 `NO_KEY_IDENTITY`(`'none'`)
- **원문 키를 넣지 않는다** — 캐시 키는 로그·디버깅에 노출될 수 있다

**깨지면**: site 모드가 익명 방문자 요청을 **오너의 개인 키로** 업스트림 호출하므로,
A 오너의 키로 받은 응답을 B 사이트가 200으로 받는 **교차 테넌트 유출**이 된다.
에러가 나지 않고 정상 응답처럼 보인다.

> 선택 인자로 만들면 잊었을 때 조용히 유출이 돌아온다. 그래서 필수로 고정했다.
> 배경: [ADR](../decisions/2026-07-29-proxy-cache-key-identity.md)

### 1.2 🔇 `getAuthUser`는 users 행 존재를 DB로 확인한다

`src/lib/auth/index.ts` — 세션 해석 후 `findById`로 행이 살아 있는지 확인하고, **DB 오류도 fail-closed**(null).

**깨지면**: JWT가 무상태라 사용자 행이 사라져도 토큰은 만료까지 유효하다. 조회를 제거하면
삭제된 계정의 토큰이 **유령 세션**이 되어 `GET /projects`는 200+`[]`, 쓰기는 FK 500,
`assertEmailVerified`가 401이어야 할 것을 403으로 오인한다.

> ⚠️ **라우트 테스트가 `getAuthUser`를 통째로 모킹하므로 단위 테스트로는 절대 안 잡힌다.**
> 이 결함의 방어선은 E2E뿐이다.
> 인증 경계는 fail-closed, 레이트리밋은 fail-open — 방향이 반대라는 것도 함께 기억할 것.

### 1.3 프록시 인가 판정은 `resolveProxyContext` 한 곳에만 있다

`src/lib/proxy/resolveProxyContext.ts` — site(익명·Host 바인딩) / app(세션+소유권) 분기의 단일 진입점.

- Host로 프로젝트가 확정되면 **클라이언트가 보낸 `projectId`는 무시**한다
- 소유권은 `assertOwner`를 재사용한다(별도 구현 금지)
- 조회 실패는 404 fail-closed

**깨지면**: 판단이 흩어져 개인 키 해석부가 소유권을 확인하지 않던 것이 2026-07-28 H-1이었다.
**라우트에 인가 분기를 새로 만들지 말 것.**

### 1.4 클라이언트 IP는 XFF 최우측만 신뢰하고, `x-real-ip` 폴백을 두지 않는다

`getClientIp()`(`src/lib/auth/rateLimit.ts`)가 단일 출처다. `adminAuth`도 이것을 호출한다.

- 최좌측은 클라이언트가 위조할 수 있어 per-IP 리밋이 무력화된다
- `x-real-ip`는 신뢰 경계가 붙였다는 보장이 없다 → **폴백을 두면 XFF 없는 경로에서 한도가 사라진다**
- 식별 불가 시 `'unknown'` 단일 버킷으로 fail-closed

**새 리밋을 추가할 때 XFF를 직접 파싱하지 말 것.**

### 1.5 로그인 스로틀의 4가지 규약

`authorizeWithLoginRateLimit`(`src/lib/auth/local-auth-config.ts`)

| 규약 | 이유 |
|------|------|
| 계정 버킷 키는 **조회된 사용자가 아니라 제출된 이메일** | 미존재/존재가 같은 동작을 해야 계정 존재 여부가 새지 않는다 |
| **실패만 세고**, 성공 시 이메일 키만 삭제(IP 키 유지) | 공유 NAT에서 한 명의 성공이 전체 예산을 리셋하면 약해진다 |
| 한도 초과 시 **`return null`** (Error를 던지지 않는다) | Auth.js가 `CallbackRouteError`로 감싸 클라이언트에 `error=Configuration`으로 보인다 — 서버 버그처럼 보인다 |
| 검사는 **DB 조회·scrypt 이전에** | 비용이 큰 연산을 공격자가 유발하게 두지 않는다 |

> 향후 UX 코드를 붙이더라도 IP/계정·존재 여부에 따라 코드를 달리하면 오라클이 된다 — **항상 같은 코드**여야 한다.
> `authorize`의 `request`는 `@auth/core`가 재구성한 것이라 헤더가 빠지면 `getClientIp`가 조용히
> `'unknown'`으로 붕괴한다. `local-auth-config.test.ts`의 XFF 회귀 테스트가 이 결합을 고정한다.

### 1.6 이메일 링크의 base URL은 host 헤더에서 도출하지 않는다

`getBaseUrl`(`src/lib/auth/routeHelpers.ts`) — `APP_URL` → `NEXT_PUBLIC_ROOT_DOMAIN` → 요청 origin 순.

**깨지면**: host 헤더를 신뢰하면 **비밀번호 재설정 링크 poisoning**이 가능하다.
프록시 뒤에서 `0.0.0.0` 링크가 나가는 것도 이 폴백이 막는다.

### 1.7 생성 상태 폴링은 타인 소유·미존재를 모두 `not_found`로 답한다

`/api/v1/generate/status/:projectId` — 403을 던지면 **인플라이트 생성의 존재 자체가 누출**된다.

---

## 2. 삭제·감사 로그

### 2.1 프로젝트 삭제는 앱 레벨 캐스케이드다 (FK는 `ON DELETE no action`)

`SqliteProjectRepository.delete()` — 단일 트랜잭션으로:

1. `platform_events`는 **지우지 않고 `project_id`만 NULL로 분리** (감사 로그는 프로젝트보다 오래 살아야 한다)
2. `generated_codes` · `project_apis` · `generation_locks` DELETE
3. `projects` DELETE

**모든 FK가 `no action`이고 `foreign_keys = ON`이므로**, 자식을 정리하지 않고 삭제하면 FK 위반 500이다.
**`projects`를 참조하는 테이블을 새로 추가하면 이 트랜잭션에도 넣을 것.**

### 2.2 계정 삭제는 `cascadeDeleteUser` 단일 동기 트랜잭션이다

`src/lib/auth/deleteAccountCascade.ts`

**깨지면**: `SqliteProjectRepository.delete()`를 루프 호출하면 각 호출이 별도 트랜잭션이라
중간 실패 시 **반쯤 지워진 계정**이 남는다. `SqliteUserRepository.delete()`를 단독으로 쓰지 말 것.
better-sqlite3 트랜잭션 안에서는 `await`가 불가능하다는 제약도 함께 기억할 것.

**`users`를 참조하는 테이블을 새로 추가하면 이 캐스케이드에도 넣을 것.**

### 2.3 🔇 삭제 이벤트의 payload 키 이름은 다른 이벤트와 다르다

| 이벤트 | payload 키 |
|--------|-----------|
| `PROJECT_DELETED` | **`deletedProjectId`** |
| `USER_DELETED` | **`deletedUserId`** |

`SqliteEventRepository.persist()`가 `payload.projectId`·`payload.userId`를 FK 컬럼에 **자동 추출**하는데,
삭제 직후 발행되는 이 이벤트는 그러면 FK 위반이 된다. persist는 best-effort라 **경고만 남기고
감사 로그가 조용히 유실**된다.

> **다른 이벤트와 통일하려고 되돌리지 말 것.** 소스에도 같은 취지의 주석이 있다.

### 2.4 계정 삭제 시 `platform_events`는 보존하되 payload를 익명화한다

`scrubEventPayload` — 세 겹을 겹친다:

1. PII 키 denylist (**`slug` 포함** — 사용자가 지은 서브도메인이라 실명이 들어갈 수 있다)
2. 주체 값(이메일·이름) 동등 스크럽
3. `userId → [deleted]`

`projectId`·점수·duration은 유지한다(감사 신호).

> 순수 denylist는 새 이벤트 타입이 이메일을 담으면 조용히 새고, 순수 allowlist는 감사 가치를 파괴한다.
> 그래서 셋을 겹친다.

---

## 3. 생성 파이프라인

### 3.1 중복 생성 차단은 DB 락 전담이다 — `generationTracker`는 진행률 전용

| 모듈 | 역할 | 쓰면 안 되는 용도 |
|------|------|------------------|
| `generationLock` (DB `generation_locks`) | **중복 차단** — 라우트가 `acquireGenerationLock` 실패 시 409 | — |
| `generationTracker` (모듈 싱글톤) | 진행률 표시 | **게이트로 쓰지 말 것** |

**깨지면**: tracker는 TTL 차등(`generating` 30분, 완료/실패 10분)이라 **엔트리가 사라지면 락도 사라진다**.
게이트를 두면 같은 projectId로 두 번째 파이프라인이 시작돼 **Opus/ET 토큰이 이중 청구**되고
같은 version으로 UNIQUE 위반이 난다.

`isGenerating()`은 그래서 제거됐고 `generationTracker.test.ts`가 **부재를 단언**한다.
크래시 시 `GENERATION_LOCK_STALE_MS`(기본 5분) 후 자동 탈취.
배경: [ADR](../decisions/2026-07-29-durable-generation-lock.md)

### 3.2 락 정리 순서: clearTimeout → stopHeartbeat → releaseGenerationLock

`generationPipeline.ts`의 `finally`. release는 절대 던지지 않는다.
**순서를 바꾸면** 해제 후에도 heartbeat가 돌아 방금 놓은 락을 되살릴 수 있다.

### 3.3 AI 호출 타임아웃은 `Promise.race`만으로 끝내지 않는다

`AbortSignal`을 함께 넘긴다. race는 즉시 종료돼도 업스트림 호출은 SDK 타임아웃(최대 ~270초)까지
살아 있어, 다음 반복이 겹치면 **토큰 비용이 이중 청구**된다.

race에서 지는 쪽의 거부는 아무도 관측하지 않으므로 생성 Promise에 no-op `.catch()`를 미리 붙여
`unhandledRejection`을 막는다(`qualityLoop.ts` 참고).

### 3.4 🔇 `thinking`을 생략하지 않는다 (Opus 5)

Opus 4.8은 생략 = 사고 없음이었지만 **Opus 5는 생략 시 adaptive가 기본으로 켜진다**.

- ET 활성: `thinking: { type: 'adaptive' }` + `output_config: { effort: 'high' }`
- ET 비활성: **`thinking: { type: 'disabled' }`를 명시** (이때 `output_config`를 아예 보내지 않는다)

**깨지면**: 생략하면 `max_tokens`를 thinking과 생성물이 나눠 써 **코드가 잘리고** 비용·지연이 는다.
`disabled` + `effort: xhigh|max`는 **400으로 거부**된다.

### 3.5 🔇 허용목록 밖 `AI_MODEL_*`는 warn 한 줄 후 조용히 폴백한다

`ALLOWED_CLAUDE_MODELS`(`AiProviderFactory.ts`)에 없는 env 값은 `TASK_DEFAULTS`로 폴백한다.

- **Railway env에 새 모델을 넣는 것만으로는 적용되지 않는다** — 허용목록도 함께 고쳐야 한다
- 적용 여부는 `GET /api/v1/admin/debug`의 `models.<task>.fellBack`이 `false`인지로 확인한다
- **구세대 ID를 목록에서 지우지 말 것** — 지우면 env를 되돌리는 **롤백이 무시된다**

### 3.6 🔇 생성 상태는 터미널 래치를 갖는다 — 먼저 도착한 종료가 이긴다

`generationStore`의 `updateProgress`·`completeGeneration`·`failGeneration`은
**`status === 'generating'`일 때만** 상태를 바꾼다. `startGeneration`만 무조건적이다(재시도 진입점).

**깨지면**: 생성은 SSE + 폴링 **이중 경로**로 돈다. 탭 복귀 시 `visibilitychange`가
`void pollForCompletion(...)`으로 폴링을 fire-and-forget 시작하는데 `pollGenerationStatus`에는
**abort가 없다.** 페이지의 `generationCompleted`·`switchedToPolling` 플래그는 *두 번째 폴링 시작*만
막을 뿐 **이미 도는 폴링을 멈추지 못한다.**

그래서 SSE가 `complete`를 준 뒤에도 살아 있는 폴링이 타임아웃·tracker TTL 만료로 `failGeneration`을
부르면, 가드가 없을 때 **성공이 실패로 뒤집혀 사용자가 성공 직후 에러 화면을 본다.**
`pollGenerationStatus`에는 `failGeneration` 호출부가 5곳이라 이 경로가 그만큼 많다.

> **이 래치는 안전벨트이고 근본 해결이 아니다.** 근본 해결은 폴링 취소(단일 terminal owner)이며
> [WBS의 E3 순서](../superpowers/plans/2026-07-31-project-wbs.md)에 P3로 잡혀 있다.
> 그 전까지 이 가드를 제거하지 말 것. `generationStore.test.ts`가 5가지 역전 순서를 고정한다.

### 3.7 Alpine 이중 init은 warnings로만 올린다

`detectAlpineDoubleInit()`이 검출하되 `errors`가 아니라 `warnings`다 — 보안 문제가 아니므로 게시를 막지 않는다.
검출 규칙은 **JS 본문을 보지 않는다**(`x-init`이 `init`을 부르면 정의돼 있으면 이중 실행, 없으면 ReferenceError라 어느 쪽이든 버그).

> **프롬프트에 `x-init` 예시를 추가할 때 로더 이름을 `init`으로 짓지 말 것.**

---

## 4. 레이트리밋·인프라

### 4.1 🔇 인메모리 레이트리밋은 활성 윈도를 evict하지 않는다

**성립 범위**: `proxy/route.ts`의 `checkProxyRateLimit` · `siteRateLimit.ts` · `auth/rateLimit.ts` ·
`utils/adminAuth.ts` **네 곳** — 인메모리 리밋 전부다(2026-08-03, C3로 예외 해소).

| 규칙 | 이유 |
|------|------|
| 만료 버킷만 정리하고, 정리 후에도 자리가 없으면 **새 키를 거부**(차단) | 살아 있는 카운터가 evict되면 다음 요청이 `count:1`로 시작해 한도가 우회된다 |
| 읽기 전용 검사(`isLimited`)도 **없는 키라도 cap이 가득이면 `true`** | 아니면 키를 회전시켜 "첫 실패는 항상 공짜"를 무한히 얻는다 |
| 용량 소진은 **로그로 드러낸다**(윈도당 1회) | fail-closed는 정상 사용자도 막는다 — 관측되지 않으면 조용한 잠금이 된다 |

> ⚠️ **`LRUMap`을 레이트리밋 버킷에 쓰지 말 것.** 만료와 무관하게 evict하므로 활성 윈도가
> 사라진다. `LRUMap` 자체는 캐시·트래커(`proxyCache`·`generationTracker`)용으로 계속 쓴다 —
> 거기서는 항목이 사라져도 정확성이 아니라 적중률만 떨어진다.

`src/lib/auth/rateLimit.ts`는 signup·forgot·resend·login이 **Map 하나를 공유**한다.
버킷 소진 시 signup·forgot이 과차단될 수 있으며 이는 **의도된 fail-closed**다.

`utils/adminAuth.ts`도 같은 트레이드오프를 수용한다: 검사가 **인증 이전**에 돌기 때문에
미인증 트래픽이 버킷을 다 채우면 정상 관리자도 차단된다. 그래서 소진 시
`logger.warn('Admin rate limit capacity exhausted ...')`를 남긴다 — 인시던트 중
`?detailed=true`가 막히면 이 로그가 유일한 단서다.

### 4.2 서브도메인 rewrite 예외는 `/api/v1/proxy` 하나뿐이다

`SUBDOMAIN_PASSTHROUGH_PREFIXES`(`src/middleware.ts`).

**깨지면**: 게시 사이트의 생성 JS가 상대경로 `/api/v1/proxy`로 호출하므로, 예외가 없으면
**API 데이터가 전부 404**가 된다. 미리보기는 apex라 정상 동작해 드러나지 않는다(2026-07-28 실측 장애).
새 경로 추가 시 최소 노출 원칙을 유지할 것.

### 4.3 CSP는 site·preview 라우트가 직접 설정하고 middleware는 건너뛴다

문자열 단일 출처는 `src/lib/constants/cdn.ts`의 `buildSiteCsp`.

**깨지면**: HTTP 표준상 CSP 헤더가 2개면 **둘 다 적용**되어 교집합만 남는다 → CDN 전부 차단 → 백지 화면.
CSP를 만질 때는 `middleware.ts` · `site/[slug]/route.ts` · `preview/[projectId]/route.ts`
**3개 파일을 반드시 동시에 확인**한다.

### 4.4 백그라운드 스케줄러의 경보 순서는 고정이다

**`logger.error`(동기) → 상태 전이(동기) → 경보(`void ...catch()`)**

- 알림 실패가 스케줄러를 죽이면 **알림 없는 상태보다 엄격히 나쁘다**
- `sendSlackAlert`에 비-reject 보장이 없다 → `onReject` 안에서 `await alertFn` 하지 말고 별도 voided promise로 분리
- **매 주기 경보 금지 — 상태 전이만.** `null/true→fail` 1회(error), `fail→success` 1회(info 복구), 연속 실패는 억제
- 상태는 **클로저 로컬**(모듈 레벨 플래그 금지) — 인스턴스 독립이라 테스트가 `vi.resetModules()`를 안 써도 된다

> `errorRateMonitor`가 `await sendSlackAlert`를 해도 되는 이유는 `EventBus.emit`이 핸들러를
> `.catch`로 감싸기 때문이다. **스케줄러에는 그 래퍼가 없다** — EventBus 소비자 코드를 복사하면 안 된다.
>
> 클로저 로컬이라는 성질의 귀결: **재배포를 넘으면 복구 경보를 검증할 수 없다**
> (`null → true`는 첫 성공이지 복구가 아니다). 2026-07-31 프로덕션에서 실증됨.

### 4.5 🔇 보존 정책은 유효한 미사용 토큰을 절대 삭제하지 않는다

`retention.ts` — `auth_tokens`는 **만료됐거나 사용된** 토큰만 삭제한다.

**깨지면**: 인증·재설정 링크가 조용히 죽는다.

부수 규약: `user_daily_limits.usage_date`는 **로컬** `YYYY-MM-DD`라 cutoff도 로컬 기준이어야 한다
(UTC로 자르면 타임존에 따라 오늘 카운터를 지운다). 세 DELETE는 단일 트랜잭션이고,
`0`·음수·비정수 env는 기본값으로 폴백한다(전체 삭제 사고 방지).

### 4.6 🔇 카운터 컬럼 ADD COLUMN에는 `DEFAULT 0`이 필수다

`user_daily_limits`처럼 `WHERE count < limit` test-and-set을 쓰는 테이블에서 `DEFAULT`가 없으면
**기존 행이 NULL**이 되고 `NULL < limit`는 참이 아니라 UPDATE가 0행 → `allowed=false`.

**사용자에게는 "한도 초과"로 보여 버그로 인지되지 않고**, `MAX(0, NULL-1)`도 NULL이라 자가 복구도 안 된다.

> `deploy_count`는 CREATE TABLE부터 있던 컬럼이라 이 경로를 겪은 적이 없다 —
> **"deploy를 그대로 따라 했다"가 안전 근거가 되지 않는다.**

### 4.7 쿼터 환불은 `charged === true`일 때만 한다

`rateLimitService` — bypass·fail-open 경로는 `charged: false`다.
조건 없이 환불하면 **DB 오류가 날 때마다 한도가 늘어난다**.

추천 라우트(`suggest-*` 4개)는 `suggestion_count`를 **공유**한다(라우트별 한도가 아니다).
차감은 검증·소유권 확인 **이후**, 환불은 throw된 경우만(soft success는 이미 토큰을 썼으므로 환불하지 않는다).

---

## 5. 데이터 계약

### 5.1 WAL 모드 — 메커니즘 불변조건 (파일 크기 스냅샷이 아님)

SQLite WAL 모드에서는 **커밋된 데이터가 체크포인트 전까지 `-wal`에만 존재할 수 있다.**
main이 크거나 WAL이 비어 있는 시점, 그 반대인 시점 모두 정상일 수 있다.
**파일 크기는 건강 지표가 아니다** — 깨끗한 종료 없이 오래 뜨면 WAL이 autocheckpoint 임계
(기본 1000페이지 ≈ 3.9MB)까지 자랄 수 있고, `.backup()` 복구 직후엔 반대로 main이 크고 WAL이 비어 있다.
어느 한쪽 크기를 “이 서비스의 영원한 사실”로 적지 말 것. 시점 관측은 [복구 런북 리허설 기록](../guides/sqlite-restore-runbook.md)에만 남긴다.

| 실수 | 결과 |
|------|------|
| 살아 있는 main을 두고 `-wal`/`-shm`만 지운다 | 체크포인트 전 커밋이 있으면 **데이터 소실** |
| 백업본으로 app.db만 덮어쓰고 옛 WAL을 남긴다 | 🔇 남은 WAL이 재생되어 **복구가 조용히 무효화**되는데 `integrity_check`는 여전히 `ok` |

**app.db 교체와 WAL/SHM 제거는 반드시 한 세트**로 한다.
`.backup()` 산출물은 **자기완결**이다 — 복구 = 그 파일 설치 + WAL/SHM 잔존 제거.
**복구 성공 판정은 `integrity_check`·파일 크기가 아니라 행 수 대조다.**
절차: [복구 런북](../guides/sqlite-restore-runbook.md)

### 5.2 slug 유일성은 DB가 아니라 앱이 관리한다

`projects.slug`에 컬럼 레벨 UNIQUE 인덱스가 없다. `assignUniqueSlug()`가
base → base-2 → … → base-10 → timestamp 폴백으로 처리하고, UNIQUE 위반 시 1회 재시도한다.

### 5.3 `generated_codes`의 version은 MAX+1이다

`UNIQUE(project_id, version)` + `getNextVersion()`이 MAX+1이므로 **동시 파이프라인 2개면 한쪽이 여기서 깨진다.**
이것이 3.1의 DB 락이 필요한 두 번째 이유다.

### 5.4 `generation_locks`에는 FK가 의도적으로 없다

스테일 락이 프로젝트 삭제를 막지 않게 하기 위함이다. 스키마에 그 취지가 주석으로 있다.

### 5.5 JSON 매퍼는 snake_case와 camelCase를 모두 처리해야 한다

`parseEndpoints()` 등 — 시드 JSON 직접 삽입 경로와 코드 경로의 필드명이 다르기 때문이다.

---

## 6. 상태 기계

`ProjectStatus`는 **8종**이다 (`src/types/project.ts`). 유니온에 남아 있어도 **라이브 전이와 화석을 섞어 그리지 말 것**.

**라이브 경로 (게시 제품 스토리):**

```
draft → generating → generated → published ⇄ unpublished
                  ↘ failed
```

**레거시 화석 (기존 Railway 배포 이력 호환용 — 신규 전이 없음):**

- `deploying` — 주석: 기존 Railway 배포 이력 호환용 (S6에서 제거 예정으로 표기)
- `deployed` — 주석: 기존 호환용 (`published`로 통합)

> 상태 기계를 그릴 때 `generating`·`failed`를 빠뜨리지 말 것. `deploying → deployed`를 **현재 배포 경로**로 문서화하지 말 것 — 제품 배포는 **publish → published** (`POST/DELETE /api/v1/projects/:id/publish`).

---

## 7. 이 명세를 갱신하는 규칙

- **불변조건을 추가·변경하는 PR은 이 문서도 같은 커밋에서 갱신한다.** 코드-문서 drift 방지가 프로젝트 원칙이다.
- 새 항목에는 반드시 **"깨지면 무슨 일이 일어나는가"**를 적는다. 그게 없으면 다음 사람이 되돌린다.
- 🔇(조용히 깨짐) 표시는 남발하지 않는다 — 테스트·CI가 잡지 못하는 것에만 붙인다.
- 실측으로 확인하지 않은 것은 넣지 않는다. 이 문서의 가치는 **전부 검증됐다는 신뢰**에 있다.

관련 현황 문서: [테스트 커버 현황 지도](../reference/test-coverage-map.md) ·
[잔여작업 WBS](../superpowers/plans/2026-07-31-project-wbs.md)
