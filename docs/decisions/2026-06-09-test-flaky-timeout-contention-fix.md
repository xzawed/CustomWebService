# ADR: Vitest full-suite 플래키 타임아웃 — 경합 기인 cold-import 지연 해소

- 날짜: 2026-06-09
- 상태: 채택
- 관련 PR: fix/test-flaky-timeout-config-providers-mock
- 관련 변경: vitest 2→4 업그레이드 직후(`pnpm install`로 lockfile 동기화) 발생

## 배경

GitHub `main` 최신화(24커밋, vitest 2.1.9 → 4.1.8, typescript 5.9 → 6.0 등) 후 `pnpm test`
전체 스위트(138 파일 / 1776 테스트)에서 **간헐적으로 2건이 `Test timed out in 5000ms`로 실패**했다.
동일 파일을 격리 실행하면 즉시 통과(3.9s)했고, 전체 실행에서만 재현되었다. 처음 실패한 두 건은
`generate.test.ts > 비로그인 401`, `projects.test.ts > 비로그인 401`이었다.

## 조사

웹 리서치(deep-research, 검증된 9개 findings)와 코드베이스 분석 워크플로우(5 probe + 적대적 비평)를
거쳐 다음을 확인했다.

1. **`vi.resetModules()` + 인-테스트 `await import('@/app/.../route')` 패턴**: 각 실패 테스트는
   `beforeEach`의 `resetModules()` 직후 **첫 `it()`**이며, 본문에서 라우트 모듈을 동적 import한다.
   resetModules는 Vitest 프로젝트-소스 레지스트리를 비우므로 첫 테스트가 라우트 그래프의
   cold transform+evaluation 비용 전부를 5000ms 예산 안에서 지불한다.
2. **pg/drizzle cold 초기화 유입 경로**: `generate/route.ts:1`·`projects/route.ts:1`이 모두
   `import { getDbProvider } from '@/lib/config/providers'`. `providers.ts` → `@/lib/db/failover`
   (`import { Client } from 'pg'`) → `@/lib/db/connection`(drizzle-orm/node-postgres). 이 체인이
   두 실패 파일에서 **미목(unmocked)**이었다. 반면 형제 api 테스트 **11개**는 `@/lib/config/providers`를
   모킹하고 있었고 — 플래키한 2개는 정확히 그 mock을 빠뜨린 파일이었다.
3. **경합 증폭 요인(실측으로 확정)**: R0(아래) 적용 후에도 머신 부하가 오르자 타임아웃이 재발했는데,
   **희생자가 옮겨다녔다**(`projects`는 통과, `generate` 잔존, `health.test.ts`가 새 희생자). 즉 특정
   무거운 import 하나가 아니라, 32코어 호스트에서 ~31 워커가 CPU를 오버구독하고 단일 메인스레드
   Vite 서버가 모듈 변환을 직렬화하면서 cold-import를 내는 **임의의 첫 테스트**가 5000ms를 넘겼다.
   **판별 진단**: `pnpm test -- --maxWorkers=4` 2회 연속 0건 → 경합이 메커니즘임을 입증.
   관찰된 스파이크는 6296ms·6464ms로 5000ms를 약간 넘는 수준이며, 격리·저워커 실행은 모두 깨끗 →
   실제 hang이 아니라 **경합 하의 cold-import 지연**.

### 기각된 가설 (오조준 방지)

- ❌ MSW `onUnhandledRequest:'warn'` 네트워크 누수가 원인 — 현재 어떤 테스트도 MSW에 도달하는
  미처리 요청을 내지 않음(모두 stub/직접 호출). 로그의 `NetworkError` flood는 happy-dom이
  `PreviewFrame` iframe `src`(localhost preview URL)를 로드 시도하는 노이즈로, 타임아웃 원인 아님.
- ❌ `PreviewFrame` 폴링 루프 — `useState`만 있고 `?t`는 새로고침 버튼 클릭 시에만 증가. 타이머/fetch 없음.
- 이상 두 가설은 코드 검증으로 기각. 잠재 위험으로만 남김(아래 후속 과제).

## 결정

두 가지를 함께 적용한다.

### R0 — `@/lib/config/providers` 모킹 (두 실패 파일)

`generate.test.ts`·`projects.test.ts` 상단에 형제 11개 파일과 동일한 mock 추가:

```ts
vi.mock('@/lib/config/providers', () => ({
  getDbProvider: vi.fn().mockReturnValue('supabase'),
}));
```

라우트의 line-1 import가 끌어오던 pg/drizzle 네이티브+CJS 초기화 체인을 **근원에서 절단**한다.
적용 후 `projects.test.ts`의 첫-테스트 스파이크가 사라졌고(import 330ms → 115ms), 두 파일이
형제 파일과 일관된다.

### R1 — `testTimeout`/`hookTimeout` 15000ms (`vitest.config.ts`)

기본 5000ms는 병렬 full-suite에서 cold-import 라우트 그래프에 너무 빠듯하다. 경합 하의 ~6.5s 스파이크에
**머신 독립적 마진**을 부여한다.

```ts
testTimeout: 15_000,
hookTimeout: 15_000,
```

## 기각된 대안

- **`maxWorkers` percentage 캡 (예: `'50%'`)**: 32코어 로컬은 완화하지만 저코어 CI(2–4 vCPU)에서는
  1워커로 직렬화되어 CI를 크게 느리게 한다. 채택 안 함.
- **`generationPipeline` 통째 mock(R5)**: `generate.test.ts`의 성공 경로 테스트가 `setupHappyPath`로
  **실제 파이프라인(mocked 내부 의존성)**을 구동하므로 통째 모킹 시 깨진다. 적용 안 함. 잔여
  `@anthropic-ai/sdk` cold 비용은 R1 마진으로 흡수됨(스파이크 6.5s ≪ 15s).
- **`pool:'threads'`**: pg-native 미설치라 네이티브 충돌 위험은 낮으나, 오버구독을 못 고치고 forks가
  격리해주는 모듈 레벨 상태 누수(`generationTracker`, `eventPersister` `registered` 플래그, `browserPool`)에
  노출. 채택 안 함.

## 검증

- R0 적용 후 두 파일 격리 17/17 통과, import 330ms → 115ms.
- **R0 단독은 불충분**: 머신 부하 상승 시 4/4 재발(희생자 이동) → 경합이 지배적임을 실측.
- `--maxWorkers=4` 2/2 통과 → 경합 판별 확정.
- **R0+R1 적용 후 기본 워커 전체 스위트 5/5 통과, 타임아웃 0건** (적용 전 동일 조건 4/7 실패와 대비).
- `pnpm type-check`·`pnpm lint` 통과.

## 후속 과제 (이번 범위 밖, 예방)

- 🔄 CI(2–4 vCPU + v8 coverage)에서 실제 타임아웃이 발생하는지 모니터링. 발생 위치(로컬 vs CI)에 따라
  워커 전략 재검토. **(상시 모니터링 — 현재 CI green, 코드 작업 없음)**
- ✅ **확인 완료**: vitest 4.1.8의 fork-pool 회귀 수정 포함 여부 — 추적 이슈 #8766(2025-10-22)·
  #8968(2025-11-14 COMPLETED)은 설치본 4.1.8(2026-06-01)보다 앞서 해결 → **4.1.8은 포함**. 다만
  해당 이슈는 풀 워커 spawn/terminate 타임아웃이고 본 사안은 경합 기인 cold-import 지연이라 **별개** —
  R1 마진(15s)은 유지한다. (핸드오프의 "PR #8705/#9027" 표기는 부정확, 실제는 위 두 이슈.)
- ✅ **완료** (브랜치 `test/test-flakiness-followups`): 예방적 하드닝 —
  MSW `onUnhandledRequest:'error'` + `*/api/v1/preview`·`*/api/v1/generate/status` 핸들러 추가,
  `PreviewFrame` iframe `src` happy-dom 로드 노이즈 차단(`navigation.disableChildFrameNavigation`),
  `health.test.ts` cold-import 하드닝(api 라우트 테스트 16/16 일관). 상세:
  [docs/superpowers/plans/2026-06-09-test-flakiness-followups.md](../superpowers/plans/2026-06-09-test-flakiness-followups.md)
- ✅ **완료** (브랜치 `test/builder-poll-extraction`): `builder/page.tsx`의 `pollForCompletion`을
  [src/lib/generation/pollGenerationStatus.ts](../../src/lib/generation/pollGenerationStatus.ts)로
  동작 보존 추출 + fake-timer 포함 단위 테스트 12건. 레포 유일 fetch-poll 루프에 커버리지 확보.
- ✅ **확인 완료**: `@/lib/config/providers`를 import하면서 mock을 빠뜨린 api 라우트 테스트 —
  `health.test.ts`가 마지막 누락분이었고 이번에 해소. 현재 16/16 모두 차단 패턴 적용.
