# 테스트 플래키 타임아웃 — 잔여·후속 작업 핸드오프

- 날짜: 2026-06-09
- 상태: **항목 1·2·3·4·6 완료**, 항목 5는 운영 모니터링(코드 작업 없음)으로 상시 유지
- 선행 ADR: [docs/decisions/2026-06-09-test-flaky-timeout-contention-fix.md](../../decisions/2026-06-09-test-flaky-timeout-contention-fix.md)

## 이 브랜치(`test/test-flakiness-followups`)에서 완료된 것

| # | 작업 | 결과 |
|---|------|------|
| 1 | `health.test.ts` cold-import 하드닝 | `@/lib/config/providers`·`@/lib/db/failover`·`@/repositories/factory` mock 3개 추가 + detailed 테스트를 `createCatalogRepository` wiring으로 재작성. **import 330ms → 25ms**, 5/5 통과. api 라우트 테스트 16/16 모두 native 그래프 차단 일관 달성 |
| 2 | `NetworkError`/`DOMException` 로그 flood 차단 | `vitest.config.ts`에 `environmentOptions.happyDOM.settings.navigation.disableChildFrameNavigation = true` 추가 (v20에서 `disableIframePageLoading`은 deprecated). `disableFallbackToSetURL`(기본 false) 보존으로 `iframe.src` 단언 무영향. full-suite 노이즈 0건 |
| 3 | MSW `onUnhandledRequest:'warn' → 'error'` + 핸들러 | `src/test/setup.ts` 전환 + `handlers.ts`에 `*/api/v1/preview/:id`·`*/api/v1/generate/status/:projectId` 예방 핸들러 추가. 전체 1776 테스트 통과(신규 실패 0건) |

검증: 전체 스위트 3회 연속 green(138 파일 / 1776 테스트), 노이즈 0건, `type-check`·`lint` 통과.

## 이번 세션에서 완료된 것 (PR #139, main 머지됨)

- **R0** — `generate.test.ts`·`projects.test.ts`에 `vi.mock('@/lib/config/providers', …)` 추가.
- **R1** — `vitest.config.ts` `testTimeout`/`hookTimeout` 15000ms (머신 독립적 경합 마진).
- 검증: 적용 전 기본 워커 4/7 실패 → 적용 후 5/5 통과 + CI 그린(Unit&Integration 포함).
- 근본 원인: 병렬 full-suite에서 워커 CPU 오버구독 → 단일 메인스레드 Vite 서버 병목 →
  `resetModules`+인-테스트 `await import(route)`의 cold-import가 ~6.5s까지 스파이크.
  특정 import 하나가 아니라 **경합**이 드라이버(희생자 이동 + `--maxWorkers=4` 0건으로 확정).

## 잔여 작업

### 1. `health.test.ts` cold-import 하드닝 — ✅ 완료 (이 브랜치)

> 아래 분석대로 mock 3개 + `createCatalogRepository` wiring으로 구현 완료. 실제 구현 시
> `vi.clearAllMocks()`가 **구현은 유지**(호출 이력만 초기화)하는 점 때문에 "DB 예외" 테스트의
> `createServiceClient.mockRejectedValue`가 다음 테스트로 누출되는 함정이 있었다 → DB 예외를
> `createServiceClient` 거부 대신 **`repo.ping()` 거부**로 구동하여 모든 detailed 테스트가
> `createCatalogRepository` 하나로만 동작하도록 통일해 해소했다.

**현황(당시)**: api 라우트를 import하는 테스트 16개 중 `health.test.ts`만 무거운 그래프를 차단하는
mock이 없다. R0-only 검증 단계에서 **실제로 타임아웃 희생자로 등장**했던 파일이다. 현재는 R1의
15s 마진이 커버하므로 **활성 실패는 아니다** — 일관성/속도 차원의 심층 방어 항목.

**왜 단일 mock으로 안 끝나는가** — [health/route.ts](../../../src/app/api/v1/health/route.ts)는
pg/drizzle을 **3개 경로**로 끌어온다:
1. `route.ts:3` `getDbProvider` → `@/lib/config/providers` → `@/lib/db/failover`(`import { Client } from 'pg'`)
2. `route.ts:4` `getFailoverStatus` → `@/lib/db/failover` **직접**
3. `route.ts:5` `createCatalogRepository` → `@/repositories/factory`가 top-level에서
   `@/lib/db/connection`(drizzle-orm/node-postgres)과 `@/repositories/drizzle`를 import
   ([factory.ts:3,24-32](../../../src/repositories/factory.ts))

`health.test.ts`는 현재 `@/lib/supabase/server`만 모킹한다(`@/repositories/factory`,
`@/lib/config/providers`, `@/lib/db/failover` 모두 미목).

**조치 (제안)**:
```ts
// health.test.ts 상단에 추가
vi.mock('@/lib/config/providers', () => ({
  getDbProvider: vi.fn().mockReturnValue('supabase'),
}));
vi.mock('@/lib/db/failover', () => ({
  getFailoverStatus: vi.fn().mockReturnValue({ active: false }), // 실제 반환 형태 확인 후 맞출 것
  isInFailover: vi.fn().mockReturnValue(false),
}));
vi.mock('@/repositories/factory', () => ({
  createCatalogRepository: vi.fn(),
}));
```
그리고 detailed 테스트(`createCatalogRepository`의 `ping`/`getUsageCounts` 사용)는
mock 반환값을 명시적으로 wiring해야 한다(현재는 `createServiceClient` mock + 실제 factory에
의존). **주의**: `getFailoverStatus()` 반환 형태와 detailed 테스트의 `body.checks.database`/
`body.usage` 단언이 깨지지 않도록 mock repo를 구성할 것.

**검증**: `pnpm exec vitest run src/__tests__/api/health.test.ts` 격리 통과 + import 시간 단축 확인
→ full-suite 플래키 루프(기본 워커 N회) 0건.

**대안**: 굳이 손대지 않아도 R1 마진으로 안전하다. 일관성을 위해서만 적용. (참고: 형제 api 테스트
11개는 `@/lib/config/providers` + `@/repositories/factory`를 함께 모킹하는 패턴)

### 2. `NetworkError` 로그 flood 차단 — ✅ 완료 (이 브랜치)

> 아래 "택1" 중 **happy-dom 설정 비활성화**로 구현. v20에서 `disableIframePageLoading`은
> deprecated → `navigation.disableChildFrameNavigation = true` 사용. `vitest.config.ts`의
> `environmentOptions.happyDOM.settings`로 전역 적용. (BrowserSettingsFactory가 navigation을
> deep-merge하므로 `disableFallbackToSetURL: false` 기본값이 보존되어 `iframe.src` 속성은
> 그대로 반영 → PreviewFrame src 단언 무영향.)

**현황(당시)**: full-suite 로그에 `DOMException NetworkError: fetch … http://localhost:3000/api/v1/preview/proj-1?t=…`가
다수 출력된다. **타임아웃 원인 아님** — [PreviewFrame.tsx:83-85](../../../src/components/builder/PreviewFrame.tsx)의
`<iframe src={previewUrl}>`(`previewUrl = /api/v1/preview/${projectId}?t=…`)를 happy-dom이 로드 시도하면서
발생. [PreviewFrame.test.tsx](../../../src/components/builder/PreviewFrame.test.tsx)가
`<PreviewFrame projectId="proj-1" />`를 8회 렌더하는 것이 출처.

**조치 (택1)**:
- happy-dom 환경에서 iframe 리소스 로딩 비활성화(setup에서 happy-dom settings의 `disableIframePageLoading`
  또는 유사 옵션 확인) — 가장 깔끔.
- 또는 PreviewFrame.test.tsx에서 iframe `src` 로드를 막는 가드/스텁.
- MSW `onUnhandledRequest: 'error'` 전환과 함께 `/api/v1/preview/:id` 핸들러 추가(아래 3번과 묶음).

**검증**: full-suite 로그에 `NetworkError`/`preview` fetch 메시지 0건.

### 3. MSW `onUnhandledRequest: 'warn' → 'error'` + 핸들러 — ✅ 완료 (이 브랜치)

> `'error'` 전환 + `handlers.ts`에 `*/api/v1/preview/:projectId`(HTML),
> `*/api/v1/generate/status/:projectId`(JSON) 예방 핸들러 추가. 전체 1776 테스트 통과 →
> 현재 MSW 미처리 요청을 내는 테스트가 없음을 실측 확인(아래 caveat대로 항상 빨갛게 죽지는
> 않으므로, 전체 통과는 "미처리 요청 부재"의 충분 증거는 아니나 회귀 없음은 확정).

**현황(당시)**: [src/test/setup.ts:4](../../../src/test/setup.ts)가 `'warn'`. 현재는 어떤 테스트도 MSW에
도달하는 미처리 요청을 내지 않지만(모두 stub/직접 호출), 미래에 자동 fetch 컴포넌트 테스트가
추가되면 무성히 행(hang)으로 빠질 수 있다.

**조치**: `'error'`로 전환 + `handlers.ts`에 `/api/v1/preview/:id`,
`/api/v1/generate/status/:projectId` 등 핸들러 추가. **주의(리서치 caveat)**: MSW `'error'`는
개별 요청을 halt하지만 비동기 전파상 테스트를 항상 빨갛게 만들지는 않는다(MSW #946/#943) — 필요 시
글로벌 fetch 스텁/afterEach 네트워크 스파이로 보강.

### 4. `builder/page.tsx` `pollForCompletion` 테스트 가드 — ✅ 완료 (추출 + 단위테스트)

> **"안전한 마운트 스모크 vs 추출+단위테스트" 선택지에서 사용자가 추출을 승인.** 폴링 로직을
> `handleGenerate` 클로저에서 [src/lib/generation/pollGenerationStatus.ts](../../../src/lib/generation/pollGenerationStatus.ts)로
> **동작 보존** 추출하고, `page.tsx`는 thin 래퍼로 교체. 의존성(`fetchFn`·`delay`·콜백)을
> 주입받아 `pollGenerationStatus.test.ts` **12 케이스**로 전 경로 검증 (generating/completed/
> unknown/failed-quirk/!res.ok/네트워크 throw/timeout/폴백/순서/interval, fake-timer 기본 delay 1건).
> DI-delay(즉시 resolve)로 대다수를 결정적으로 검증하고, 기본 `setTimeout` 경로는
> `vi.useFakeTimers()` + `runAllTimersAsync()`로 1건 커버. 레포 유일 fetch-poll 루프에 실제 커버리지 확보.

**조치(완료)**: 폴링을 순수·주입형 함수로 추출 → 단위 테스트. **발견한 기존 quirk(미수정, 보존)**:
`status:'failed'`는 즉시 실패하지 않고 `throw` → catch에서 마지막 시도일 때만 실패시키므로,
'failed'가 지속되면 `maxAttempts`(120)까지 재시도 후 실패한다. 추출은 동작 변경 없이 보존만 했으며,
개선은 별도 사안. (향후 `builder/page.tsx`를 **마운트**하는 테스트를 쓸 땐 여전히
`vi.useFakeTimers()` + 언마운트 후 timer advance + status MSW 핸들러를 지킬 것.)

## 후속 모니터링 (코드 아님)

### 5. CI 타임아웃 발생 위치 추적 — 🔄 상시 모니터링 (코드 작업 없음)
현재 CI(Unit&Integration·E2E·Build·Lint) 전부 green이라 추적할 타임아웃 이벤트가 없다. **트리거**:
CI 로그에 `Test timed out` 재발 시. **대응**: 발생 위치(로컬 32코어 오버구독 vs CI 2–4 vCPU +
v8 coverage)에 따라 워커 전략 재검토(저코어 CI는 이미 워커가 적어 percentage 캡은 역효과).
지금 시점 코드 변경 없음.

### 6. vitest 4.1.8 fork-pool 회귀 수정 포함 여부 — ✅ 확인 완료
**조사 결과(2026-06-09)**: vitest 4.x는 tinypool을 제거하고 풀을 재작성했고, fork-pool 타임아웃
회귀 추적 이슈는 **#8766**(2025-10-22 closed)·**#8968**(2025-11-14 **COMPLETED**)이다(핸드오프가
적었던 "PR #8705/#9027"은 부정확). 두 이슈 모두 4.1.0(2026-03-12)·**설치본 4.1.8(2026-06-01)**
출시보다 4~7개월 앞서 해결됨 → **4.1.8은 이 수정을 포함한다.**

**그러나 R1 마진(15s)은 낮추지 않는다.** #8766/#8968은 풀 워커 spawn/terminate 타임아웃
(`[vitest-pool]: Timeout starting forks runner`)이고, 우리가 겪은 건 **경합 기인 cold-import의
테스트레벨 `Test timed out in 5000ms`** — 메커니즘이 다르다(ADR에서 fork-pool 가설 기각). 별개
사안이라 마진 인하 근거가 없다.

## 마무리

항목 1·2·3·4·6은 완료(브랜치 `test/test-flakiness-followups`, `test/builder-poll-extraction`).
항목 5만 상시 모니터링으로 남으며 코드 트리거 시에만 대응한다. 전부 **활성 버그가 아닌
예방/일관성/모니터링** 항목이었다.
