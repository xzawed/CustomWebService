# 커버리지 개선 회고 (2026-04-26)

> PR #45 + PR #46 — 테스트 커버리지 대규모 개선 작업 전체 회고

## 최종 성과

| 항목 | 이전 | 이후 | 변화 |
|------|------|------|------|
| 테스트 수 | 856개 | 1,078개 | +222개 |
| 로컬 커버리지 (lines) | 59.52% | 71.77% | +12.25pp |
| Codecov | ~49% (CI 기준) | 71%+ (예상) | +22pp |
| SonarCloud | 32.6% | 대폭 상승 예상 | — |
| 신규 테스트 파일 | — | 32개 | — |

---

## 문제의 시작 — "개선이 미미하다"

첫 라운드에서 237개 테스트를 추가했음에도 Codecov가 49.16%에서 거의 움직이지 않았다. 처음에는 테스트 전략이 잘못된 것으로 의심했지만, 조사 결과 원인은 두 가지였다.

### 1. CI 타이밍 문제
Codecov에 업로드된 커버리지 데이터는 **CI가 실행된 시점**의 커밋 기반이다. PR #45 첫 커밋이 병합되기 전에 Codecov를 확인했기 때문에, 실제로는 로컬에서 이미 59.52%까지 올라가 있었는데 Codecov 대시보드는 이전 CI 결과를 보여주고 있었다.

### 2. SonarCloud vs Codecov 지표 불일치
더 근본적인 혼동 원인은 두 도구의 측정 범위 차이였다.

| 도구 | 측정 범위 | 분모 |
|------|-----------|------|
| Codecov (vitest) | `src/lib/**`, `src/services/**`, `src/providers/**`, `src/repositories/**` | ~10,601 lines |
| SonarCloud | 프로젝트 내 모든 TypeScript 파일 | ~21,980 lines |

`vitest.config.ts`의 `coverage.include` 설정이 4개 디렉터리만 추적하도록 되어 있어서, SonarCloud는 테스트가 전혀 없는 `components/`, `app/`, `hooks/`, `stores/` (~11,379 lines)를 분모에 포함하기 때문에 항상 낮게 나온다. Codecov가 71%여도 SonarCloud는 구조적으로 40% 이하로 나올 수밖에 없다.

**교훈**: 여러 커버리지 도구를 함께 사용할 때 각 도구의 측정 범위를 먼저 확인해야 한다. 숫자만 비교하면 잘못된 결론을 내린다.

---

## 무엇이 효과적이었나

### 0% 파일 타겟팅 전략
가장 효과적인 접근은 "이미 70%인 파일을 75%로 올리기"보다 "0%인 파일에 기본 커버리지 추가"였다. tracked scope 내 0% 파일 목록을 먼저 뽑고, 파일당 테스트를 집중 추가하는 방식이 커버리지 숫자를 빠르게 올렸다.

### Mock-heavy 테스트도 소스 커버리지에 기여한다
처음에는 "DB나 fetch를 mock하면 실제 코드가 실행되지 않는다"고 오해했다. 하지만 V8 커버리지는 **소스 라인이 실행되었는지**를 측정하고, mock된 의존성을 호출하는 코드(service/repository 메서드 본문)는 실제로 실행된다. `supabase.from().select().eq()` 체인을 mock해도 그 체인을 조립하는 repository 코드는 실행된다.

### Supabase 체이닝 mock 패턴 표준화
```ts
const chain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: item, error: null }),
};
supabase.from = vi.fn().mockReturnValue(chain);
```
이 패턴 하나로 대부분의 Supabase repository를 테스트할 수 있었다. 패턴이 확립된 뒤에는 새 테스트 파일 작성이 단순 반복 작업이 되었다.

### global fetch mock 패턴
`githubService.ts`, `railwayService.ts` 같은 외부 HTTP 호출 파일은 `vi.stubGlobal('fetch', mockFetch)` 패턴으로 일관되게 처리했다. Node.js `http` 모듈이 아닌 Web Fetch API를 쓰는 파일에서 신뢰성이 높았다.

### 병렬 에이전트 디스패치
한 세션에서 여러 에이전트를 병렬로 실행하여 독립적인 파일들을 동시에 작성했다. 파일 간 의존성이 없는 테스트 파일 추가 작업에서 속도 이점이 컸다.

---

## 무엇이 어려웠나

### 모듈 레벨 상태 격리 (`eventPersister.ts`)
`let registered = false` 같은 모듈 레벨 플래그가 있는 파일은 테스트 간 상태가 누출된다. 해결책은 `vi.resetModules()` + 매 테스트마다 `await import('./eventPersister')` 동적 임포트였다. 이 패턴이 필요한 파일은 반드시 사전에 식별해야 한다.

### `generationPipeline.ts`의 `evaluateComplexityScore` 보너스 중복
복잡도 점수 테스트에서 "모든 API에 같은 category를 쓰면 sameCategoryMultiple 보너스가 자동으로 발동"하는 사이드이펙트가 있었다. 각 시그널을 독립적으로 테스트하려면 다른 시그널을 격리할 수 있는 데이터를 신중하게 설계해야 했다. 처음에는 이 때문에 3개 테스트가 실패했다.

### PR 타이밍 실수
PR #45가 2차·3차 커밋이 추가되기 전에 병합되었다. cherry-pick으로 해결했지만 추가 PR(#46)이 필요해졌다. 이런 상황에는 "PR을 먼저 생성하되 병합은 모든 작업 완료 후"라는 워크플로우가 더 안전하다.

### `findAllByUser` / `getProjectApiIds` 체인 resolution 차이
같은 Supabase 체이닝 패턴이지만, 일부 메서드는 `.single()`이 아닌 `.eq()`에서 최종 resolve가 일어났다. 이를 미리 파악하지 못하면 mock이 실제 코드 경로와 맞지 않아 undefined 반환이나 타임아웃이 발생한다. 소스 코드를 먼저 읽고 **실제로 어느 체인 메서드가 최종 await를 받는지** 확인하는 것이 필수다.

---

## 커버리지 한계 분석

현재 추가 개선이 구조적으로 어려운 파일들:

| 파일/디렉터리 | 이유 |
|--------------|------|
| `lib/auth/` (supabase 클라이언트 초기화) | Next.js 서버 컨텍스트 의존, `cookies()` 호출 불가 |
| `lib/supabase/` (클라이언트 초기화) | 환경변수 의존, 실제 클라이언트 생성 경로 테스트 불필요 |
| `lib/db/schema.ts` | Drizzle 스키마 정의 — 실행 코드가 없음 |
| `lib/qc/renderingQc.ts`, `deepQcRunner.ts` | Playwright 브라우저 실행 의존 |
| `lib/ai/generationPipeline.ts`의 `runGenerationPipeline` | Stage 0~3 + qualityLoop + QC 전체 체인 — 의존성이 너무 많아 단위 테스트로 의미있는 커버리지 확보 어려움 |

SonarCloud 32% → 50%+ 이상 끌어올리려면 `components/`, `app/`의 React 컴포넌트 테스트가 필요하다. 그러나 이 파일들은 UI 렌더링, Zustand store, Next.js router에 깊이 의존하여 비용 대비 효용이 낮다.

**현실적 목표**: tracked scope(lib/services/providers/repositories) 75~80%가 합리적인 다음 목표. SonarCloud 40%+는 컴포넌트 테스트 없이는 어렵다.

---

## 신규 확립된 테스트 패턴 (docs/guides/testing.md에 문서화 완료)

1. **Supabase 체이닝 mock** — select/eq/single/order를 mockReturnThis로 연결
2. **Drizzle mock** — `makeMockDb()`로 `.select()/.from()/.where()` 체인 mock
3. **global fetch mock** — `vi.stubGlobal` + `afterEach(vi.unstubAllGlobals)`
4. **module-level 상태 격리** — `vi.resetModules()` + 동적 import
5. **Factory mock** — `vi.mock` + type cast로 반환값 제어

---

## 다음 커버리지 개선 기회

우선순위 순:

1. **`lib/ai/stageRunner.ts`** — Stage 실행 함수, evaluateComplexityScore와 유사하게 함수별 단위 테스트 가능
2. **`lib/qc/qcChecks.ts` (현재 37%)** — 개별 체크 함수들은 DOM-free라 테스트 용이
3. **`services/generationService.ts`** — 현재 커버되지 않은 브랜치 추가 가능
4. **React 컴포넌트 테스트** — `@testing-library/react` 도입 시 SonarCloud 수치 극적 개선 가능 (단, ROI 고려 필요)
