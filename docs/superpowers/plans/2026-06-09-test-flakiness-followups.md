# 테스트 플래키 타임아웃 — 잔여·후속 작업 핸드오프

- 날짜: 2026-06-09
- 상태: 다음 세션 인계용 (이번 세션은 PR #139까지 완료)
- 선행 ADR: [docs/decisions/2026-06-09-test-flaky-timeout-contention-fix.md](../../decisions/2026-06-09-test-flaky-timeout-contention-fix.md)

## 이번 세션에서 완료된 것 (PR #139, main 머지됨)

- **R0** — `generate.test.ts`·`projects.test.ts`에 `vi.mock('@/lib/config/providers', …)` 추가.
- **R1** — `vitest.config.ts` `testTimeout`/`hookTimeout` 15000ms (머신 독립적 경합 마진).
- 검증: 적용 전 기본 워커 4/7 실패 → 적용 후 5/5 통과 + CI 그린(Unit&Integration 포함).
- 근본 원인: 병렬 full-suite에서 워커 CPU 오버구독 → 단일 메인스레드 Vite 서버 병목 →
  `resetModules`+인-테스트 `await import(route)`의 cold-import가 ~6.5s까지 스파이크.
  특정 import 하나가 아니라 **경합**이 드라이버(희생자 이동 + `--maxWorkers=4` 0건으로 확정).

## 잔여 작업

### 1. `health.test.ts` cold-import 하드닝 — 우선순위: 낮음

**현황**: api 라우트를 import하는 테스트 16개 중 `health.test.ts`만 무거운 그래프를 차단하는
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

### 2. `NetworkError` 로그 flood 차단 — 우선순위: 낮음 (노이즈)

**현황**: full-suite 로그에 `DOMException NetworkError: fetch … http://localhost:3000/api/v1/preview/proj-1?t=…`가
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

### 3. MSW `onUnhandledRequest: 'warn' → 'error'` + 핸들러 — 우선순위: 낮음 (예방)

**현황**: [src/test/setup.ts:4](../../../src/test/setup.ts)가 `'warn'`. 현재는 어떤 테스트도 MSW에
도달하는 미처리 요청을 내지 않지만(모두 stub/직접 호출), 미래에 자동 fetch 컴포넌트 테스트가
추가되면 무성히 행(hang)으로 빠질 수 있다.

**조치**: `'error'`로 전환 + `handlers.ts`에 `/api/v1/preview/:id`,
`/api/v1/generate/status/:projectId` 등 핸들러 추가. **주의(리서치 caveat)**: MSW `'error'`는
개별 요청을 halt하지만 비동기 전파상 테스트를 항상 빨갛게 만들지는 않는다(MSW #946/#943) — 필요 시
글로벌 fetch 스텁/afterEach 네트워크 스파이로 보강.

### 4. `builder/page.tsx` `pollForCompletion` 테스트 가드 — 우선순위: 낮음 (예방)

**현황**: 레포 내 **유일한 실제 fetch-poll 루프**([builder/page.tsx](../../../src/app/(main)/builder/page.tsx)
`pollForCompletion`, `setTimeout(1000)` 슬립)이지만 이를 마운트하는 테스트가 **없어서** 현재 무해.

**조치**: 향후 builder/page.tsx 테스트 작성 시 **반드시** `vi.useFakeTimers()`로 슬립 제어 +
언마운트 후 timer advance + `/api/v1/generate/status/:projectId` MSW 핸들러 제공. (유지보수자 가이드:
async 작업이 테스트보다 오래 살아남으면 RPC 채널 닫힘 → 행 발생.)

## 후속 모니터링 (코드 아님)

### 5. CI 타임아웃 발생 위치 추적
이번 PR은 CI(Unit&Integration) 통과. 다만 타임아웃이 로컬 32코어(오버구독)에서인지 CI(2–4 vCPU +
v8 coverage)에서인지 미확정. CI에서 재발하면 워커 전략(저코어에서는 이미 워커 적음) 재검토.

### 6. vitest 4.1.8 fork-pool 회귀 수정 포함 여부
fork-pool 타임아웃 회귀(이슈 #8766/#8968)는 PR #8705/#9027로 부분 수정됨. 설치 버전 4.1.8이 이를
포함하는지 changelog로 미확정. 추후 패치 bump 시 확인 — 포함되면 R1 마진을 낮춰도 될 수 있음.

## 권장 실행 순서 (다음 세션)

1. (선택) 1번 `health.test.ts` 하드닝 — 작지만 mock 3개 + repo wiring 필요, R1이 이미 커버하므로 급하지 않음.
2. (선택) 2번 NetworkError flood 차단 — 로그 가독성 개선. 3번 MSW 전환과 묶어 한 PR로.
3. 4번은 builder/page.tsx 테스트를 **실제로 작성할 때** 함께.
4. 5·6번은 운영 모니터링 — 코드 변경 트리거 시에만.

모두 **활성 버그가 아닌 예방/일관성** 항목이다. 우선순위 낮음 — 다른 기능 작업과 함께 묶어 처리해도 무방.
