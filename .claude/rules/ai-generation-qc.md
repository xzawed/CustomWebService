---
paths:
  - "src/lib/ai/**"
  - "src/lib/qc/**"
  - "src/providers/**"
---

# AI 생성·QC 파이프라인을 손댈 때

> 이 파일은 **경로 스코프 규칙**이다. 위 `paths`에 해당하는 파일을 Claude가 **읽을 때만**
> 컨텍스트에 들어온다. 루트 `CLAUDE.md`에서 옮겨온 내용은 **한 줄도 없다** —
> 원래 `docs/`에만 있어서 사실상 열리지 않던 것을 여기로 끌어올린 것이다.
>
> ⚠️ **발동 조건을 오해하지 말 것.** 이 규칙은 **Read 시점**에 뜬다.
> 매칭 경로에 **새 파일을 Write로 만들 때는 뜨지 않는다**(읽을 파일이 없으므로).
> 따라서 "새 파일을 만들 때 지켜야 할 규칙"을 여기에 두면 안 된다 — 그건 `CLAUDE.md`에 남는다.

## 먼저 열어야 하는 문서

| 무엇을 손대나 | 열 문서 |
|---|---|
| QC 단계·임계값·재생성 판단 | [docs/guides/qc-process.md](../../docs/guides/qc-process.md) — 8단계 표준 프로세스 |
| Stage 구성·프롬프트·복잡도 배점 | [docs/architecture/ai-pipeline.md](../../docs/architecture/ai-pipeline.md) |

## 그 문서에만 있고, 모르면 조용히 깨지는 것

- **파이프라인 총 예산은 290초**(`PIPELINE_MAX_DURATION_MS`)다. Railway 300초 한도에서
  10초만 남긴 값이라 여유가 거의 없다. **Quality Loop는 반복을 시작하기 전에 잔여 예산을
  확인해야 한다** — 확인 없이 반복을 늘리면 마지막 반복이 잘려 나가고, 사용자에겐
  "생성 실패"로만 보인다.

- **QC 타임아웃은 차단이 아니다.** Fast 3초 / Deep 10초를 넘기면 `null`을 반환하고
  **파이프라인은 그대로 진행**한다(`QC_FAST_TIMEOUT_MS` · `QC_DEEP_TIMEOUT_MS`).
  이걸 실패로 바꾸면 업스트림이 느린 날 전부 생성 실패가 된다. 반대로 `null`을
  "통과"로 취급해도 안 된다 — 점수가 없는 것이지 좋은 것이 아니다.

- **Deep QC는 Fast QC가 실패했을 때만 돈다.** 항상 돌린다고 가정하고 코드를 짜면
  비용·지연이 조용히 늘어난다.

- **복잡도 배점의 진실원은 코드다** (`evaluateComplexityScore`, `generationPipeline.ts`).
  ET 활성 조건은 `>= ET_COMPLEXITY_THRESHOLD`(기본 35)이며, "API 3개" 또는 "컨텍스트 500자"
  **단독으로는 도달하지 않는다**(각 5pt·15pt). 문서 수치를 고칠 때 코드와 대조할 것 —
  2026-08-06에 `ai-pipeline.md`가 3pt를 10pt로 적고 있었고, 그 값은 단조성까지 깨고 있었다.

## 파일 소유권 (qc-process.md §4의 부분 사본이 아니라 진입점만)

`codeValidator`(보안·품질) · `qualityLoop`(재시도) · `renderingQc`(Fast/Deep 오케스트레이터) ·
`deepQcRunner`(비동기 저장 후 업데이트) · `browserPool`. 전체 표는 위 qc-process.md §4.
