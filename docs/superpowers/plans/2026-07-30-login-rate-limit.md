# 로그인 레이트리밋 + auth 버킷 정리 (#223)

- 작성: 2026-07-30
- 상태: 계획 (착수 전)
- 이슈: [#223](https://github.com/xzawed/CustomWebService/issues/223)

> 이 문서는 **다음 작업 세션의 착수점**이다. 구현은 포함하지 않는다.

## 문제 1 — 로그인에만 스로틀이 없다

`enforceRateLimit` 적용 현황:

| 경로 | 한도 |
|---|---|
| `auth/signup` | 5회/시간/IP |
| `auth/forgot-password` | 5회/시간/IP |
| `auth/resend-verification` | 3회/시간/사용자 |
| **로그인** | **없음** |

`/api/auth/*`(Auth.js Credentials)와 `authorizeCredentials`(`local-auth-config.ts`) 어디에도
앱 레벨 스로틀이 없다. 비밀번호 시도를 막는 것은 **scrypt 연산 비용과 공격자 대역폭뿐**이다.

공개 셀프서비스 가입 서비스라 사용자 테이블이 작고 credential stuffing이 현실적이다.
가입·재설정은 막아 두고 로그인만 열려 있는 것은 일관성도 맞지 않는다.

## 문제 2 — auth 레이트리밋 Map이 만료 버킷을 정리하지 않는다

`src/lib/auth/rateLimit.ts`에 `delete`·`sweep`·`prune`이 없다.
만료된 IP 버킷이 **그 키가 다시 조회될 때까지 남는다**. IP를 돌리는 트래픽에서 메모리가 단조 증가.

프록시·site 리미터는 만료분을 정리한다(`siteRateLimit.ts`의 `sweepExpired`). auth만 안 한다.

**한도 우회는 아니다.** 이전에 고쳤던 LRU eviction 버그(활성 카운터가 evict되어 `count:1`로 재시작)와는
반대 방향의 문제다 — 여기서는 남아 있는 게 문제이지 사라지는 게 문제가 아니다.

## 설계 시 반드시 지킬 것 (CLAUDE.md 규칙)

- **LRU eviction으로 활성 윈도를 버리지 말 것** — 우회가 된다
- 만료 버킷만 정리하고, 정리 후에도 자리가 없으면 **새 키를 거부(차단)**. 우회보다 과차단이 안전
- 클라이언트 IP는 `getClientIp()` 단일 출처(XFF **최우측**, `x-real-ip` 불신). 직접 파싱 금지

## ✅ 결정 완료 (2026-07-30) — 이 계획서는 이력이 되었다

사용자 결정: **"IP + 계정(잠금 없는 방식)"**.
per-IP 10회/15분 + per-account 5회/**5분**(짧은 윈도로 표적 DoS를 5분으로 상한).
구현·근거는 [ADR](../../decisions/2026-07-30-login-rate-limit.md) 참조.

아래는 결정 당시의 검토 내용이다.

## 설계 결정이 필요했던 지점 (해소됨)

**IP 단위와 계정 단위 중 무엇을, 혹은 둘 다 볼 것인가.**

| 방식 | 뚫리는 곳 | 부작용 |
|---|---|---|
| IP만 | 분산 공격(IP 회전)에 무력 | 없음 |
| 계정만 | — | 공격자가 남의 계정을 **의도적으로 잠글 수 있다**(계정 잠금 DoS) |
| 둘 다 | — | 계정 잠금 DoS는 여전 — 완화책 필요 |

계정 단위를 도입하면 **정상 사용자를 가두지 않는지** 반드시 확인해야 한다.
지수 백오프나 짧은 윈도로 완화하는 방안 검토.

## Auth.js 적용 지점

`authorizeCredentials`(`local-auth-config.ts`) 내부에서 걸 것인지, `/api/auth/callback/credentials`
앞단(미들웨어)에서 걸 것인지 결정 필요. **middleware는 Edge runtime**이라 Node 전용 모듈을 못 쓴다 —
`rateLimit.ts`가 Edge-safe한지 확인할 것.

## 완료 판정

- [ ] 로그인 경로 레이트리밋 (IP·계정 방침 결정 및 근거 기록)
- [ ] 계정 단위 적용 시 정상 사용자 잠금 여부 확인
- [ ] `rateLimit.ts` 만료 버킷 정리 — 활성 카운터는 절대 버리지 않는 패턴
- [ ] 한도 초과 응답이 **계정 존재 여부를 노출하지 않는지** 확인
- [ ] 우회 방지·정리 동작을 테스트로 고정
