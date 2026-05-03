# Quality Loop 재활성화 및 ET 타임아웃 분리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quality Loop를 안전하게 재활성화하고, Extended Thinking(ET) 활성화 시 더 긴 타임아웃을 별도 적용해 인시던트 재발 방지

**Architecture:** `runLlmRetryIteration()`에서 `useET` 플래그로 타임아웃 값을 분기. `QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS` 환경변수 추가. 환경변수 조정은 Task 1(코드 변경 없음), 코드 변경은 Task 2.

**Tech Stack:** TypeScript, Vitest, Railway 환경변수

---

## 배경

2026-05-03 인시던트에서 `QUALITY_LOOP_ITERATION_TIMEOUT_MS=80000`이 ET 활성화 시 AI 응답 시간(90~150초)보다 짧아 매번 타임아웃이 발생했다.
현재 `QUALITY_LOOP_MAX_ITERATIONS=0`으로 Quality Loop 전체가 비활성화된 임시 조치 상태.

**근본 문제**: ET 조건(API ≥ 3개 또는 컨텍스트 ≥ 500자)에서 응답 시간이 크게 다름에도 타임아웃 값이 단일. ET 비활성 시 30~60초, ET 활성 시 90~150초.

---

## 파일 구조

- Modify: `src/lib/ai/qualityLoop.ts:273-274` — 타임아웃 분기 로직
- Modify: `src/lib/ai/qualityLoop.test.ts` — ET 타임아웃 테스트 케이스 추가
- Modify: `docs/reference/env-vars.md` — `QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS` 항목 추가
- Modify: `CLAUDE.md` — 환경변수 섹션 업데이트

---

## Task 1: Quality Loop 환경변수 재조정 (코드 변경 없음)

**Files:**
- Railway Variables (환경변수만 조정, 코드 변경 없음)

Railway 로그에서 최근 AI 응답 시간을 확인한 뒤 아래 값으로 조정.

- [ ] **Step 1: Railway 로그에서 AI 응답 시간 측정**

  ```bash
  railway logs --tail 200 | grep -E "(generation completed|Quality loop|stage.*completed|tokensUsed)"
  ```
  또는 Railway MCP `get-logs`로 최근 생성 로그 조회.
  
  확인 포인트:
  - ET 비활성 생성의 AI 응답 완료까지 소요 시간
  - ET 활성 생성(`extendedThinking: true`)의 AI 응답 완료까지 소요 시간
  
  **참고 수치 (인시던트 분석 결과)**: ET 비활성 30~60초, ET 활성 90~150초

- [ ] **Step 2: Railway 환경변수 조정**

  측정값 기준으로 20~30초 여유를 두어 설정:

  ```
  QUALITY_LOOP_ITERATION_TIMEOUT_MS = 150000   # ET 비활성 기준 상한 (측정 후 조정)
  QUALITY_LOOP_MAX_ITERATIONS = 1              # 1회 재시도로 재활성화 (안전하게 시작)
  ```

  > **왜 1회부터 시작하나**: Quality Loop 단일 반복 최대 시간 = AI 응답 시간 + 검증 시간. 2회로 올리면 Railway 300초 HTTP 타임아웃 여유가 좁아진다. 운영 안정성 확인 후 2회로 상향.

- [ ] **Step 3: docs/reference/env-vars.md Railway 컬럼 업데이트**

  `QUALITY_LOOP_MAX_ITERATIONS` 행:
  ```
  | `QUALITY_LOOP_MAX_ITERATIONS` | `2` | ✅ **`1` 운영 중** | 품질 루프 최대 반복 횟수 ... |
  ```

  `QUALITY_LOOP_ITERATION_TIMEOUT_MS` 행:
  ```
  | `QUALITY_LOOP_ITERATION_TIMEOUT_MS` | `120000` | ✅ **`150000` 운영 중** | ... |
  ```

- [ ] **Step 4: 커밋 (docs만)**

  ```bash
  git add docs/reference/env-vars.md
  git commit -m "docs: Quality Loop 재활성화 — 환경변수 운영 상태 반영"
  ```

---

## Task 2: ET 조건 타임아웃 분리 (코드 변경)

**Files:**
- Modify: `src/lib/ai/qualityLoop.ts:273-274`
- Modify: `src/lib/ai/qualityLoop.test.ts`
- Modify: `docs/reference/env-vars.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 테스트 먼저 작성 (TDD)**

  `src/lib/ai/qualityLoop.test.ts`에 아래 테스트 추가:

  ```typescript
  describe('runLlmRetryIteration — ET 타임아웃 분기', () => {
    it('ET 비활성 시 QUALITY_LOOP_ITERATION_TIMEOUT_MS 사용', async () => {
      vi.stubEnv('QUALITY_LOOP_ITERATION_TIMEOUT_MS', '90000');
      vi.stubEnv('QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS', '200000');
      // useET=false → 90000ms 타임아웃 적용 확인
      // setTimeout mock으로 검증
    });

    it('ET 활성 시 QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS 사용', async () => {
      vi.stubEnv('QUALITY_LOOP_ITERATION_TIMEOUT_MS', '90000');
      vi.stubEnv('QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS', '200000');
      // useET=true → 200000ms 타임아웃 적용 확인
    });

    it('QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS 미설정 시 ET 기본값 200000 사용', async () => {
      vi.unstubAllEnvs();
      // useET=true, 환경변수 없음 → defaultTimeout 200000 사용
    });
  });
  ```

- [ ] **Step 2: 테스트 실행 — FAIL 확인**

  ```bash
  pnpm test src/lib/ai/qualityLoop.test.ts
  ```
  Expected: 새 테스트 FAIL (로직 미구현)

- [ ] **Step 3: qualityLoop.ts 타임아웃 분기 구현**

  `src/lib/ai/qualityLoop.ts` 273-274번 줄 수정:

  ```typescript
  // 변경 전
  const _loopVal = Number.parseInt(process.env.QUALITY_LOOP_ITERATION_TIMEOUT_MS ?? '', 10);
  const iterationTimeoutMs = Number.isNaN(_loopVal) || _loopVal <= 0 ? 120_000 : _loopVal;

  // 변경 후
  const timeoutEnvKey = options.useET
    ? 'QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS'
    : 'QUALITY_LOOP_ITERATION_TIMEOUT_MS';
  const defaultTimeoutMs = options.useET ? 200_000 : 120_000;
  const _loopVal = Number.parseInt(process.env[timeoutEnvKey] ?? '', 10);
  const iterationTimeoutMs = Number.isNaN(_loopVal) || _loopVal <= 0 ? defaultTimeoutMs : _loopVal;
  ```

  > **설계 근거**: `options.useET`는 `runLlmRetryIteration()` 호출 시 이미 전달되므로(line 282) 추가 인터페이스 변경 없음. ET 기본값 200초 = 인시던트 분석 기준 ET 최대 응답 150초 + 50초 여유.

- [ ] **Step 4: 테스트 실행 — PASS 확인**

  ```bash
  pnpm test src/lib/ai/qualityLoop.test.ts
  ```
  Expected: 모든 테스트 PASS

- [ ] **Step 5: 전체 테스트 실행**

  ```bash
  pnpm test
  ```
  Expected: 전체 PASS

- [ ] **Step 6: docs/reference/env-vars.md — 신규 환경변수 추가**

  QC 섹션 `QUALITY_LOOP_ITERATION_TIMEOUT_MS` 아래에 추가:

  ```markdown
  | `QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS` | `200000` | ➖ | Extended Thinking 활성 시 품질 루프 반복당 타임아웃 (ms). ET 활성 조건(API ≥ 3개 또는 컨텍스트 ≥ 500자)에서만 사용. 미설정 시 기본값 200000(200초). ET 응답은 90~150초 소요되므로 일반 타임아웃(`QUALITY_LOOP_ITERATION_TIMEOUT_MS`)과 별도 관리 |
  ```

- [ ] **Step 7: CLAUDE.md 환경변수 섹션 업데이트**

  기존 `QUALITY_LOOP_ITERATION_TIMEOUT_MS` 설명 뒤에:

  ```markdown
  - `QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS` — ET 활성화 시 Quality Loop 반복당 타임아웃 (기본: 200000ms = 200초). ET 응답이 최대 150초 소요되므로 일반 타임아웃과 별도 설정
  ```

- [ ] **Step 8: 커밋**

  ```bash
  git add src/lib/ai/qualityLoop.ts src/lib/ai/qualityLoop.test.ts \
          docs/reference/env-vars.md CLAUDE.md
  git commit -m "feat: Quality Loop ET 조건 타임아웃 분리 — QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS 추가"
  ```

- [ ] **Step 9: PR 생성 및 머지**

  ```bash
  git push -u origin feat/quality-loop-et-timeout
  gh pr create --title "feat: Quality Loop ET 타임아웃 분리" \
    --body "ET 활성 시 응답 시간이 최대 150초인데 단일 타임아웃으로 관리하던 문제 해결. QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS 환경변수 추가(기본 200s). 2026-05-03 인시던트 재발 방지."
  ```

---

## 작업 순서 권장

1. **Task 1 먼저** — 코드 변경 없이 즉시 Quality Loop 재활성화 가능. 운영 환경에서 실제 AI 응답 시간 데이터 수집.
2. **Task 2 이후** — 수집한 데이터를 바탕으로 ET 타임아웃 기본값 검증 후 코드 변경 적용.

Task 1 완료 후 며칠간 운영 데이터 확인 → `QUALITY_LOOP_MAX_ITERATIONS=2` 상향 여부 결정 → Task 2 진행이 권장 순서.
