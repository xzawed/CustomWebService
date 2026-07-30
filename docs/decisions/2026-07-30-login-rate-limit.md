# 로그인 레이트리밋 — IP + 계정, 잠금 없는 방식 (#223)

- 날짜: 2026-07-30
- 상태: 채택
- 관련: [#223](https://github.com/xzawed/CustomWebService/issues/223), PR #232

## 배경

`enforceRateLimit`이 `auth/signup`(5회/시간/IP) · `auth/forgot-password`(5회/시간/IP) ·
`auth/resend-verification`(3회/시간/사용자)에는 걸려 있는데 **로그인만 비어 있었다.**
`/api/auth/*`(Auth.js Credentials)와 `authorizeCredentials` 어디에도 앱 레벨 스로틀이 없어,
비밀번호 시도를 막는 것은 **scrypt 연산 비용과 공격자 대역폭뿐**이었다.

공개 셀프서비스 가입 서비스라 사용자 테이블이 작고 credential stuffing이 현실적이다.
가입·재설정은 막아 두고 로그인만 열어 두는 것은 일관성도 맞지 않았다.

부수 문제로 `src/lib/auth/rateLimit.ts`에 만료 버킷 정리가 없어(`delete`/`sweep`/`prune` 부재)
IP를 돌리는 트래픽에서 **메모리가 단조 증가**했다.

## 결정

### 1. IP + 계정 이중 스로틀, 단 계정 쪽은 짧은 윈도만

> 사용자 결정(2026-07-30): **"IP + 계정(잠금 없는 방식)"**

| 스코프 | 기본값 | 이유 |
|---|---|---|
| per-IP | **10회 실패 / 15분** | signup(5/시간)보다 느슨하다 — 로그인은 오타가 정상이고 이메일 발송 비용이 없다. 공유 NAT·모바일 IP 변동도 고려 |
| per-account | **5회 실패 / 5분** | 분산 공격(IP 회전)에 대한 실질 브레이크. **5분이면 표적 DoS의 상한이 5분**이라 "관리자 풀 때까지 잠김"이 되지 않는다 |

IP만 보면 IP를 돌리는 stuffing에 무력하고, 계정만 보면 공격자가 남의 계정을 잠글 수 있다.
둘 다 걸되 **계정 쪽 잠금을 시간 제한으로 묶는 것**이 이 결정의 핵심이다.

1~2분 윈도는 stuffing을 거의 못 늦추고, 30~60분은 잠금 DoS로 느껴진다. 5분이 절충점이다.
전부 `src/lib/config/rateLimit.ts`의 env로 조절 가능하다.

### 2. 계정 버킷은 **제출된 이메일**로 키를 잡는다 (조회된 사용자가 아니라)

존재하지 않는 이메일과 존재하는 이메일이 **완전히 같은 스로틀 동작**을 하게 만들어
계정 존재 여부가 새지 않게 한다. 회귀 테스트로 고정했다.

### 3. 실패만 센다. 성공하면 이메일 키를 지운다(IP 키는 유지).

정상 로그인이 예산을 깎으면 안 된다. 성공 시 이메일 키를 지우면 "오타 몇 번 → 정상 로그인 →
나중에 또 오타"에서 윈도가 끝나기를 기다리지 않아도 된다. **오라클이 되지 않는다** —
비밀번호를 맞혀야만 도달하는 경로다.

IP 키는 지우지 않는다. 공유 NAT에서 한 명이 성공했다고 전체 예산이 리셋되면 약해진다.

### 4. 한도 초과 시 `return null` — 잘못된 비밀번호와 구분 불가

Auth.js에서 `authorize`가 `null`을 반환하면 코어가 `CredentialsSignin`을 던지고,
로그인 페이지는 `res.error`가 truthy이면 **고정 문구 하나**("이메일 또는 비밀번호가
올바르지 않습니다")를 보여 준다. 즉 스로틀·오답·미존재가 모두 동일 신호다.

`RateLimitError` 같은 일반 `Error`를 던지면 `CallbackRouteError`로 감싸져
클라이언트에는 `error=Configuration`으로 보인다 — 서버 버그처럼 보이므로 쓰지 않는다.

**트레이드오프**: 사용자가 왜 실패했는지 모른다. 향후 UX가 필요하면 `CredentialsSignin`
서브클래스에 **일반 코드 하나**(`too_many_attempts`)를 붙이는 방법이 있다. 단
IP/계정 스로틀을 구분하거나 계정 존재 여부에 따라 코드를 달리하면 오라클이 되므로
**어떤 경우에도 같은 코드**여야 한다.

### 5. 한도 검사는 DB 조회·scrypt **이전에** 한다

스로틀의 목적 중 하나가 연산 비용 차단이다.

### 6. 공유 Map에 sweep + 용량 상한, 활성 윈도는 절대 버리지 않는다

`MAX_AUTH_RATE_LIMIT_BUCKETS`(기본 10000). 신규 키 삽입 전 **만료분만 정리**하고,
그래도 자리가 없으면 **신규 키를 거부**한다. CLAUDE.md 규칙 그대로다 —
LRU eviction으로 활성 카운터를 버리면 다음 요청이 `count:1`로 시작해 **한도가 우회된다.**

**`isLimited`는 없는 키라도 cap이 가득이면 `true`를 반환한다**(fail-closed).
그렇지 않으면 키를 회전시켜 "첫 실패는 항상 공짜"를 무한히 얻을 수 있다.

`checkRateLimit`은 시그니처가 그대로지만 이제 같은 cap을 공유한다 —
**키 플러드 상황에서 signup·forgot-password가 과차단될 수 있다.** 의도된 fail-closed다.
용량 소진 시 `logger.warn`을 윈도당 1회 남겨(폭주 억제) 운영자가 상한을 올릴 수 있게 했다.

## Auth.js 결합에 대한 주의 (회귀 테스트로 고정)

`authorize(credentials, request)`의 두 번째 인자는 `@auth/core@0.41.3`이
`new Request(url, { headers: Object.fromEntries(req.headers), method, body })`로
**재구성**한 것이다(`lib/actions/callback/index.js`). 현재는 `x-forwarded-for`가 보존되지만
패키지에 `TODO: Forward the original request as is`가 달려 있다.

**헤더가 빠지면 `getClientIp`가 조용히 `'unknown'`으로 붕괴해 모든 클라이언트가 한 버킷을
공유한다** — per-IP 한도가 사실상 사라지는데 아무도 모른다. 그래서 재구성된 Request 형태를
그대로 만들어 최우측 XFF를 읽는지 단언하는 테스트를 넣었다. 패키지가 바뀌면 여기서 깨진다.

## 의도적으로 하지 않은 것

- **middleware에 걸지 않았다.** 로그인 바디(이메일)를 다시 파싱해야 하고, 계정 스코프는
  결국 `authorize`에서 다시 봐야 한다. scrypt 그래프를 edge로 끌어오는 것도 금지다.
- **`callbacks.signIn` 사용 안 함** — authorize 성공 뒤에 실행되므로 실패를 못 본다.
- **`adminAuth`의 별도 LRUMap은 손대지 않았다.** 범위 밖이고, 그쪽 LRU 패턴은 여기서
  따라 하면 안 되는 안티패턴이다.
- **타이밍 오라클은 완전히 해소하지 않았다.** 미존재 사용자는 scrypt 전에 반환된다(기존 동작).
  스로틀이 존재 여부에 의존하지 않으므로 **더 나빠지지는 않는다.**
- **단일 인스턴스 전제.** 멀티 인스턴스로 가면 Redis 등 외부 저장소가 필요하다
  (generationTracker·프록시 리미터와 동일 제약).
