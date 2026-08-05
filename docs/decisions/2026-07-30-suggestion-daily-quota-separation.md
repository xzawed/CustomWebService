# AI 추천 일일 쿼터 분리 (#219)

> **언제 읽나**: suggest-apis/context/preferences/modification 일일 쿼터, suggestion_count·MAX_DAILY_SUGGESTIONS, createForTask('suggestion') 모델, 차감 시점(검증 후)을 손댈 때 — DEFAULT 0 누락 시 전 사용자 잠금

- 날짜: 2026-07-30
- 상태: 채택
- 관련: [#219](https://github.com/xzawed/CustomWebService/issues/219), PR #224

## 배경

`suggest-apis` · `suggest-context` · `suggest-preferences` · `suggest-modification`
네 라우트가 모두 **코드 생성 쿼터**(`checkAndIncrementDailyLimit`, `MAX_DAILY_GENERATIONS`, 기본 10회)를
차감하고 있었다. 추천은 빌더 화면에서 자연스럽게 여러 번 호출되는 보조 기능인데,
사용자는 이걸 몇 번 쓰는 것만으로 그날의 **코드 생성 10회를 전부 소진**했다.
쿼터가 실제로 새고 있었으므로 라이브 영향 있는 결함으로 분류했다.

두 번째 문제는 **차감 시점**이었다:

- `suggest-context` — 바디 파싱 **전에** 차감. 잘못된 JSON을 보내도 쿼터가 깎였다.
- `suggest-modification` — `findById`/`assertOwner` **전에** 차감. 남의 `projectId`나
  존재하지 않는 ID를 보내 403/404를 받아도 쿼터가 깎였다(자기 자신에 대한 DoS, 그리고
  타인이 아닌 자신의 계정만 소모시키므로 공격보다는 자해에 가깝다).

세 번째로 `suggest-modification`만 `AiProviderFactory.create()`를 써서 `ClaudeProvider`
기본 모델(**Sonnet 5**)로 호출하고 있었다. 나머지 셋은 `createForTask('suggestion')`(Haiku 4.5)다.
같은 일에 3배 단가를 내고 있었다.

## 결정

### 1. `suggestion_count` 별도 카운터

`user_daily_limits`에 `suggestion_count`를 추가하고(`deploy_count`와 동일한 형태),
`MAX_DAILY_SUGGESTIONS`(기본 **30**, pro **150**)로 제한한다.
30 = 생성 한도(10)의 3배 — 추천은 Haiku로 돌아 생성(Opus) 대비 훨씬 싸므로
넉넉하게 잡되 무제한은 아니게 했다.

네 라우트가 **하나의 예산 30회를 공유**한다(라우트별 30회가 아니다).

### 2. 마이그레이션에 `DEFAULT 0` 필수

`ALTER TABLE user_daily_limits ADD suggestion_count integer DEFAULT 0;`

**`DEFAULT 0`이 빠지면 프로덕션 전체 사용자가 조용히 잠긴다.** 기존 행의 새 컬럼은
`NULL`이 되고, test-and-set의 `WHERE suggestion_count < 30`은 `NULL < 30` → `NULL`(참이 아님)
→ UPDATE 0행 → `allowed=false`. 사용자에게는 "한도 초과"로 보이므로 버그로 인지되지 않는다.
`decrement`의 `MAX(0, NULL - 1)`도 `NULL`이라 자가 복구도 안 된다.

기존 `deploy_count`는 이 문제를 겪은 적이 없다 — CREATE TABLE 때부터 있던 컬럼이라
살아 있는 행에 ALTER를 한 이력이 없기 때문이다. 즉 deploy를 그대로 따라 한다고
안전이 보장되지 않는다.

회귀 방지 테스트를 `SqliteRateLimitRepository.test.ts`에 넣었다:
`suggestion_count` 없는 테이블 → `generation_count > 0`인 행 삽입 → ALTER → 첫 차감이 `true`인지 단언.

### 3. 검증 후 차감 + 실패 시 환불

네 라우트 모두 아래 순서로 통일했다.

```
getAuthUser → assertEmailVerified → Zod 파싱 → (소유권 검사) → 차감 → AI 호출 → catch: 환불
```

환불은 `generate/route.ts`의 `pendingDecrement` 계약을 그대로 따른다 —
**`charged === true`일 때만** 환불한다. bypass(`RATE_LIMIT_BYPASS_USER_IDS`)와
fail-open(DB 오류)은 카운터를 올리지 않으므로, 조건 없이 환불하면 호출할 때마다 한도가 늘어난다.

**soft success는 환불하지 않는다** — AI가 응답했으나 파싱 결과가 빈 배열이거나
`recommendPreferences`가 `FALLBACK_RESULT`로 떨어진 경우는 이미 토큰을 썼다.
throw된 경우만 환불한다.

### 4. `assertEmailVerified` 게이트 추가

generate/regenerate/deploy는 이미 이메일 인증을 요구한다. 미인증 계정은 어차피
코드를 생성할 수 없으므로 추천에 비용을 쓰게 둘 이유가 없다.

### 5. 전용 i18n 키

`rateLimit.suggestionExceeded` — 기존 `rateLimit.exceeded`는 "일일 **생성** 한도"라
30회짜리 추천 한도에 재사용하면 사용자가 생성 한도를 다 쓴 것으로 오해한다.

## 의도적으로 하지 않은 것

- **80% 경고 이벤트 미발행.** generation은 `getCurrentUsage()`로 80% 도달 시
  `API_QUOTA_WARNING`을 낸다. 추천은 전용 사용량 조회 메서드를 추가하지 않았고,
  30회 한도의 보조 기능에 경고까지 붙일 실익이 없다고 판단했다.
- **`generate/route.ts`의 차감 순서는 손대지 않았다.** generate는 여전히 프로젝트
  검증 전에 차감한다. suggest 쪽만 더 엄격하게 둔 것이며, 일관성을 명분으로
  suggest를 generate 수준으로 되돌리지 말 것.

## 영향

- 기존 사용자: 추천 사용이 생성 한도를 잠식하지 않는다. 실질적으로 생성 가능 횟수가 늘어난다.
- 미인증 계정: 추천 호출이 403이 된다(생성은 원래도 막혀 있었다).
- 비용: `suggest-modification`이 Sonnet 5 → Haiku 4.5로 내려간다.
