# 검수 MEDIUM 발견 항목 수정 (2026-07-29)

> **언제 읽나**: qualityLoop AbortSignal/abort, rateLimit charged 환불, proxy 인메모리 리밋 Map(활성 버킷 eviction 금지), getClientIp 의 x-real-ip 미신뢰, isPrivateHost IPv4-mapped SSRF 를 손댈 때

## 상태

승인됨 — 구현 완료

## 배경

[2026-07-28 전체 검수](2026-07-28-published-site-proxy-authz.md)에서 확정한 13건 중
CRITICAL 2건·HIGH 2건은 PR #195에서 처리했다. 이 ADR은 남은 **MEDIUM 6건**을 다룬다
(M-4는 위험도가 이번 변경으로 상승해 #195에 선반영됨).

## 수정 내역

### M-1 — Quality Loop 타임아웃이 업스트림 호출을 취소하지 않음 (비용 이중청구)

`Promise.race`로 타임아웃만 걸고 `AbortSignal`을 넘기지 않아, race는 즉시 종료돼도
**Anthropic 호출은 SDK 타임아웃까지 계속 살아 있었다.** 다음 반복이 또 다른 호출을
시작하므로 Opus/ET 호출이 중첩되어 토큰 비용이 이중 청구됐다. 또한 뒤늦게 거부되는
고아 Promise에 핸들러가 없어 `unhandledRejection` 위험도 있었다.

`AiPrompt.abortSignal`과 `ClaudeProvider`의 `{ signal }` 전달은 **이미 배선되어 있었고
qualityLoop만 사용하지 않고 있었다.** 반복마다 `AbortController`를 만들어 타임아웃 시
`abort()`하고, race에서 지는 쪽의 거부가 관측되지 않는 문제를 막기 위해 생성 Promise에
no-op catch를 미리 붙인다.

### M-2 — Quality Loop 이후 stale `validation` 저장

루프가 코드를 교체해도 `saveGeneratedCode`에는 **루프 이전** `validation`이 전달돼,
실제 서빙되는 코드와 다른 코드의 `securityCheckPassed`·`validationErrors`가 DB에 남았다.
재계산 결과(`finalValidation`)를 저장에도 넘긴다. 오류 검사에만 쓰고 버리던 값이다.

### M-3 — 레이트리밋 fail-open + 무조건 환불로 무료 할당량 증가

`checkAndIncrementDailyLimit`은 우회(bypass)·DB 오류(fail-open) 시 **카운터를 올리지
않는데**, 실패 경로는 조건 없이 `decrementDailyLimit`을 호출했다. 사용자가 5/10인 상태에서
fail-open → 파이프라인 실패 → 환불이면 4/10이 된다. DB 오류가 반복될수록 한도가 늘어난다.

반환값을 `{ charged: boolean }`으로 바꾸고, **청구된 경우에만** 환불 경로를 만든다.
환불 경로가 라우트(`pendingDecrement`)와 파이프라인(`handlePipelineFailure`) 두 곳이므로,
파이프라인에는 청구되지 않았을 때 no-op 디크리멘터를 주입해 양쪽을 한 번에 막는다.

### M-5 — `generationTracker` 락 소실 (부분 대응)

엔트리가 TTL(생성 중 30분) 또는 size cap으로 사라지면 `complete()`가 조용히 no-op이 되어,
**코드는 저장됐는데 상태 폴링은 not_found를 보고**한다. `isGenerating()`도 false가 되어
중복 파이프라인이 시작될 수 있다.

근본 해결은 외부 저장소 기반 durable lock이며 단일 인스턴스 인메모리 구조에서는 불가능하다.
**관측 가능하게만 만들었다** — 엔트리 없이 완료되면 `logger.warn`을 남긴다. 상태 엔드포인트에
DB 폴백이 있어 사용자 영향은 이미 일부 완화되어 있다. 멀티 인스턴스 전환 시 Redis 등으로
교체할 때 함께 해결할 사안으로 남긴다.

### M-6 — 프록시 레이트리밋 LRU eviction이 활성 카운터를 리셋

`LRUMap(1000)`이라 활성 사용자가 상한을 넘으면 **살아 있는 윈도의 카운터가 evict되어**
그 사용자의 다음 요청이 `count:1`로 다시 시작한다. 동시 사용자가 많을수록 60/분 한도가
무력화된다.

일반 `Map`으로 바꾸고 만료 버킷만 정리한다. 정리 후에도 자리가 없으면 활성 카운터를
버리는 대신 **차단**한다(우회보다 과차단이 안전). PR #195에서 신규 site 리미터에 적용한
원칙을 기존 리미터에도 통일했다.

### M-7 — IPv4-mapped IPv6 SSRF 우회

`isPrivateHost('::ffff:127.0.0.1')`이 **false**였다 — IPv4 패턴에도 IPv6 패턴에도 걸리지
않는다. Node의 `dns.lookup`이 매핑 형식을 돌려줄 수 있어 실제 도달 가능한 경로다.
매핑 주소를 IPv4로 정규화한 뒤 검사하고, 16진 표기(`::ffff:7f00:1`)는 대역 자체를 차단한다.

### M-8 — `x-real-ip` 신뢰

XFF가 없으면 `x-real-ip`로 폴백했는데, 이 헤더는 신뢰 경계(Railway 엣지)가 붙였다는 보장이
없어 클라이언트가 자유롭게 위조·회전할 수 있다. 폴백을 두면 XFF 없는 경로에서 per-IP
한도(signup·비밀번호 재설정 메일 발송)가 통째로 무력화된다.

폴백을 제거하고 식별 불가일 땐 단일 `'unknown'` 버킷으로 모아 **fail-closed** 한다.

> 트레이드오프: Railway가 항상 XFF를 붙이므로 프로덕션 영향은 없다. XFF가 없는 환경으로
> 이전하면 모든 요청이 한 버킷을 공유해 과차단될 수 있으므로, 그때는 해당 플랫폼이 붙이는
> 신뢰 가능한 헤더를 명시적으로 추가해야 한다.

## 검증

| 항목 | 결과 |
|------|------|
| `pnpm lint` | 0 errors (warning 2건 — 기존) |
| `pnpm type-check` | 통과 |
| `pnpm test` | **168 파일 / 2070건 통과** |

신규 회귀 테스트: IPv4-mapped IPv6 3종(리터럴 2 + DNS 해석 1) SSRF 차단,
`x-real-ip` 미신뢰, `{ charged }` 반환 계약.

기존 테스트 다수가 옛 동작을 검증하고 있어 함께 갱신했다 — `checkAndIncrementDailyLimit`
mock 반환값(7개 파일), `x-real-ip` 폴백 단언 2건.

## 미해결 — 운영 조치 필요

`__Secure-authjs.callback-url`이 `https://0.0.0.0:8080`으로 설정된다. `AUTH_URL`이
코드·문서 어디에도 참조되지 않아 Auth.js가 컨테이너 바인드 주소에서 유도한 값이다.

`AUTH_TRUST_HOST=true`가 설정되어 있어 실제 로그인은 정상 동작하므로 영향은 낮으나,
**Railway 환경변수에 `AUTH_URL=https://xzawed.xyz`를 추가**하는 것이 정확하다.
코드 변경이 아니라 운영 설정이므로 이 PR 범위 밖이다.

## 관련 문서

- [게시 사이트 프록시 복구·인가 모델 정비 ADR](2026-07-28-published-site-proxy-authz.md)
