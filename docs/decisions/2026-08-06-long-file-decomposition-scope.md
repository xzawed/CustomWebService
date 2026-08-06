# 긴 파일 분해 범위 확정 — 3종 중 0종을 분해한다 (2026-08-06)

> **언제 읽나**: `src/lib/qc/qcChecks.ts` · `src/lib/ai/generationPipeline.ts` ·
> `src/app/(main)/builder/page.tsx` 를 **"길어서 쪼개려" 할 때**. 또는 WBS의 F14
> (거대 모듈 분해)를 다시 열려 할 때.

**날짜**: 2026-08-06
**Status**: Accepted

## 컨텍스트

WBS F14는 `promptBuilder.ts` 1437→384 성공(2026-08-05) 이후 잔여 3종을 남겨 뒀다:
`builder/page.tsx` 757 · `qcChecks.ts` 682 · `generationPipeline.ts` 485.

착수 전 세 파일의 **구조**를 실측하니 성격이 완전히 갈렸다 — WBS가 셋을 한 묶음으로
적은 것 자체가 부정확했다.

| 파일 | 줄 | 함수 | 최대 함수 | 중앙값 |
|---|---:|---:|---:|---:|
| `builder/page.tsx` | 757 | 1 | 713 | 713 |
| `qcChecks.ts` | 682 | 14 | 75 | 47 |
| `generationPipeline.ts` | 485 | 13 | 147 | 11 |

## 결정

**세 파일 모두 분해하지 않는다.** `builder/page.tsx`의 **바이트 동일 중복 제거**만 예외로 한다.

### 1. `qcChecks.ts` — 결합도가 0인 독립 함수 나열이다

- 모듈 레벨 선언이 `interface` 하나뿐이고 **가변 모듈 상태 0건**
- 함수 간 호출은 `checkInteractiveBehavior → sub-check 2개` 하나뿐. 나머지 export는
  **서로를 전혀 부르지 않는다**
- 프로덕션 소비자는 `renderingQc.ts` **한 곳뿐**이고 `src/lib/qc/index.ts`는 재export하지 않는다

→ fast/deep/interactive로 3분할하면 import 사이트가 각각 늘고, barrel을 남기면 간접층만
추가된다. **순비용이다.** 함수별 복잡도는 그대로 옮겨간다(E3).

### 2. `generationPipeline.ts` — 이미 분해가 끝났다

함수 실측 범위 합이 404줄(83%). 비함수 81줄은 import 18 + 타입 37(호출자 3곳의 계약이라
옮기면 파일과 import만 는다) + 상수·주석·공백이다.

147줄 오케스트레이터 `runGenerationPipeline`의 실코드는 ~90줄이고, **순서를 정하는 것이
그 함수의 일이다.** 특히 abort 타이머 등록과 `finally`의 3단 순서
(`clearTimeout` → `stopHeartbeat` → `releaseGenerationLock`)는 **load-bearing**이며
주석이 이유를 적어 두었고 integration 테스트가 그 순서를 단언한다 — 래퍼로 감싸면
순서가 헬퍼 안으로 숨어 **순 손해**다.

`evaluateComplexityScore`(39줄)도 쪼개지 않는다: `.claude/rules/ai-generation-qc.md` 가
*"복잡도 배점의 진실원은 이 함수"* 라고 못박고 있어, 5개로 쪼개면 그 포인터가 가리킬
단일 지점이 사라진다.

이 파일의 판정은 **"안전망이 없어서 못 한다"가 아니라 "안전하게 할 수 있는데 얻을 게 없다"** 다
(커버리지 Stmts 99.44% / Branch 87.82%).

### 3. `builder/page.tsx` — 훅·컴포넌트 추출은 1:1 이동이다

자식 컴포넌트 15개가 **이미 전부 프레젠테이션 리프**다. 마크업은 100% 나갔지만
**상태는 100% 남았다** — 지금까지의 추출은 위젯 마크업을 줄였지 오케스트레이션을 줄이지 않았다.

훅 추출(`useApiCatalog` / `useRelevanceGate` / `useContextEditor` / …)은 전부 1:1 이동이다.
`handleNextStep`의 mode×step 판단, `handleModeSelect`/`handleResetMode`의 팬아웃 리셋은
오케스트레이터가 어디에 있든 사라지지 않는다. **이걸 "복잡도 감소"로 보고하는 것이
E3에서 경계한 바로 그 거짓말이다.**

화면 컴포넌트 추출도 순증이다 — page는 줄어도 props 인터페이스와 호출부 배선이
**컴포넌트당 +45줄** 늘어 repo 총량이 증가한다.

> ⚠️ **훅 추출은 없던 위험까지 만든다.** `handleModeSelect`/`handleResetMode`가 로컬
> `setState` 7개를 deps에서 생략한 것은 React가 setState identity를 보장하므로 **지금은
> 합법**인데, 훅 안의 래핑 리셋 함수로 재노출되는 순간 그 보장이 사라져
> *"모드 전환 후 이전 추천이 남는"* 진짜 stale closure가 된다.

**예외 — 바이트 동일 중복은 제거한다.** sha256으로 확인한 4종(step3 생성 화면 29줄 ·
컨텍스트 편집 꼬리 8줄 · SelectedApiZone 6줄 · CatalogView 8줄이 각각 두 벌)은
새 파일 없이 hoist 1건 + 지역 const 3건으로 없앤다. 441행 `relevanceGateNode`가
이미 이 파일의 확립된 패턴이다. **이것이 유일하게 복잡도가 실제로 감소하는 변경이다.**

## 근거의 등급 (G1)

**전부 코드 읽기 등급이다.** 라이브 실측은 커버리지 실행(`pnpm test:coverage`)과
glob 매칭(picomatch)뿐이다.

> ⚠️ **인지 복잡도 수치를 근거로 쓰지 않았다.** 착수 초기에 쓴 추정치(226 / 43 / 30)는
> SonarCloud 토큰이 없어 대조하지 못했고, 독립 카운트와 **2~3배 괴리**했다
> (`qcChecks` 43→15~18 · `generationPipeline` 30→17~19). `builder`의 226은
> "React 컴포넌트 함수 = 1개"라는 계측 전제가 만든 값일 가능성이 높다.
> 이 결정은 cx가 아니라 **결합도·소비자 수·바이트 동일 해시**에 근거한다.

## 재검토 트리거

- `builder/page.tsx`에 **기능을 추가해야 해서 실제로 손대게 될 때**. 그때는 특성화
  테스트가 이미 있으므로 추출 비용이 지금보다 낮다
- `qcChecks.ts`에 체크가 **20개를 넘고** 함수 간 공유 헬퍼가 생길 때
- `generationPipeline.ts`에 Stage 4가 추가될 때

**그 외에는 다시 열지 말 것.** "길어서"는 근거가 아니다.

## 이 조사가 실제로 찾은 것 — 분해가 아니라 결함 4건

분해 값어치를 판정하려고 `builder/page.tsx`를 전수로 읽는 과정에서 결함 4건이 나왔다.
**이것이 F14의 실제 산출이다.**

| # | 결함 | 확인된 경로 |
|---|---|---|
| 1 | `regenVersion` 미리셋 → 미리보기 404 | `setRegenVersion`이 `onRegenerationComplete`(2곳)에서만 호출되고 **어디서도 리셋되지 않는다**. 574·694행이 `regenVersion ?? version`이라 우선순위가 높아, 재생성 후 방식 변경 시 새 프로젝트에 옛 버전을 넘긴다 |
| 2 | `isPreferenceLoading` 영구 true | 비행 중 abort → `finally`의 `!aborted` 가드가 리셋을 스킵 → 다음 실행이 212행 가드 분기로 조기 반환하며 `false`를 놓친다. **`try` 안의 조기 `return`은 원인이 아니다** — `finally`가 그 경로를 덮는다 |
| 3 | 인기 서비스 데드엔드 | `apis`가 비어 있으면(카탈로그 미로드·실패) `clearApis()`로 선택만 지우고 아무것도 추가하지 못하는데, `setLastRecommendedContext`·`setRecommendationsError(false)`는 그대로 설정돼 재조회까지 막힌다 |
| 4 | 늦은 응답이 사용자 선택을 덮어씀 | `AbortController`가 113행(카탈로그)·217행(preferences) **둘뿐**이다. `fetchSuggestions`·`fetchApiRecommendations`엔 없고, 후자는 `clearApis()` 후 추천을 주입한다 |

전부 **코드 읽기 등급**이며 브라우저 재현은 하지 않았다. 프로덕션 발생 빈도도 미측정이다.

## 선행 조치 (완료)

`src/app/(main)/builder/page.tsx`가 **커버리지 집계에서 빠져 있었다** — 고쳐도 codecov/patch·
SonarCloud가 0%로 계산하므로 회귀를 구조적으로 못 잡았다. `vitest.config.ts`의
`coverage.include`에 편입했다([PR #284](https://github.com/xzawed/CustomWebService/pull/284)).

`(auth)`에서 이미 겪은 **괄호 경로 glob 함정**을 그대로 다시 밟았다 —
`'src/app/(main)/**/*.tsx'`는 **매칭 0건**이고 문자 클래스 형태만 잡힌다(picomatch 실측).
상세: [test-coverage-map §3.2](../reference/test-coverage-map.md).

`codecov.yml`·`sonar-project.properties`는 아직 건드리지 않았다 — 둘 다
`src/app/**/page.tsx`를 제외하는데, **테스트 없이 제외를 풀면 builder를 건드리는 모든 PR이
patch 0%로 실패한다.** 세 곳을 함께 켜는 것은 특성화 테스트가 생긴 뒤다.

## 관련

- [WBS F14](../superpowers/plans/2026-07-31-project-wbs.md) — 이 결정으로 F14는 닫힌다
- [agent-working-rules.md](../guides/agent-working-rules.md) — E3 교훈("추출은 복잡도를 옮긴다")
- [test-coverage-map.md §3.2](../reference/test-coverage-map.md) — 괄호 경로 glob 함정
