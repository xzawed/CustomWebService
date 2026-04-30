# ADR: 코드 생성 성공률 개선 — Phase 2 (2026-04-29)

## 배경

프로덕션 운영 중 코드 생성 파이프라인에서 세 가지 범주의 문제가 반복적으로 발생했다.

1. **하드 타임아웃**: Railway의 300초 요청 제한으로 인해 Claude API 호출이 커넥션 끊김으로 종료되는 경우, 파이프라인이 graceful termination 없이 실패했다.
2. **Quality Loop 교착**: Quality Loop의 단일 반복(iteration)이 hang 상태에 빠지면 전체 3회 재시도가 소진될 때까지 블록되었다.
3. **오탐(False Positive) 검증**: `validateSecurity()` 가 인라인 `<script>`를 오류로 분류했으나, `assembleHtml()`의 DOMPurify가 어차피 이를 제거하므로 실질적인 차단이 없음에도 생성 성공률을 낮추고 있었다.

또한 Stage 3(디자인 폴리시) 실패가 로그에만 남고 구조화된 모니터링이 없어 얼마나 자주 폴백이 발생하는지 파악할 수 없었으며, Admin QC Stats API가 성공 건수만 보여줘 실제 성공률을 계산할 수 없었다.

## 결정 사항

### 1. ClaudeProvider 타임아웃·재시도 개선

**무엇을**: Claude API 호출에 270초 타임아웃 설정. 429(Rate Limit) 응답 시 `Retry-After` 헤더 값을 우선 사용하여 대기 시간 계산.

**왜**: Railway는 300초 이후 TCP 커넥션을 강제 종료한다. 타임아웃을 270초로 설정하면 Railway 컷오프 전에 파이프라인이 명시적 오류를 반환할 수 있어 사용자에게 더 명확한 피드백을 제공한다. `Retry-After` 헤더를 무시하고 지수 백오프만 사용할 경우 실제 허용 대기 시간보다 훨씬 긴 불필요한 대기가 발생할 수 있다.

**관련 파일**: `src/providers/ClaudeProvider.ts`

### 2. Quality Loop 반복당 타임아웃

**무엇을**: `QUALITY_LOOP_ITERATION_TIMEOUT_MS` 환경변수 도입(기본값: 120,000ms / 120초). Quality Loop의 각 반복에 개별 타임아웃을 적용.

**왜**: 단일 반복이 hang 상태에 빠지면 기존 구조에서는 모든 재시도 기회(최대 3회)를 소비하는 동안 전체 요청이 블록됐다. 반복당 타임아웃을 적용하면 한 번의 hang이 전체 Quality Loop를 마비시키는 상황을 방지할 수 있다.

**관련 파일**: `src/lib/ai/qualityLoop.ts`, `docs/reference/env-vars.md`

### 3. 인라인 스크립트 탐지 강등 (error → warning)

**무엇을**: `validateSecurity()` 내 인라인 `<script>` 탐지를 오류(error)에서 경고(warning)로 강등.

**왜**: `assembleHtml()`은 DOMPurify를 통해 인라인 스크립트를 자동으로 제거한다. 따라서 인라인 스크립트가 포함된 코드가 생성되더라도 최종 서빙 결과물에는 포함되지 않는다. 이미 자동 제거되는 내용을 이유로 생성 자체를 차단하는 것은 오탐이며, 불필요하게 성공률을 낮추는 결과를 초래했다.

**관련 파일**: `src/lib/qc/validateSecurity.ts`

### 4. Stage 3 폴백 이벤트 추적

**무엇을**: Stage 3(디자인 폴리시) catch 블록에서 `STAGE3_FALLBACK_USED` 도메인 이벤트 발행. Stage 3 실패 시 Stage 2 결과로 폴백하며 이 사실을 이벤트로 기록. `eventPersister`를 통해 `platform_events` 테이블에 자동 영속화.

**왜**: Stage 3 실패는 기존에 콘솔 로그로만 남아 운영 중 얼마나 자주 발생하는지 집계가 불가능했다. 구조화된 이벤트로 기록함으로써 Stage 3 실패율을 시계열로 추적하고, 개선 우선순위를 데이터 기반으로 결정할 수 있다.

**관련 파일**: `src/lib/ai/generationPipeline.ts`, `src/types/events.ts`, `docs/architecture/events.md`

### 5. Admin QC Stats — 실성공률 지표 추가

**무엇을**: Admin QC Stats API 응답에 `failureCount`(CODE_GENERATION_FAILED 이벤트 수)와 `realSuccessRate`(성공 건수 / 전체 시도 건수) 필드 추가.

**왜**: 기존 지표는 성공한 생성 건수만 보여줬다. 전체 시도 대비 성공 비율(실성공률)을 계산하려면 실패 건수도 함께 조회해야 하지만 해당 데이터가 API에 노출되지 않았다. 두 지표를 함께 제공함으로써 파이프라인 개선 효과를 정량적으로 측정할 수 있다.

**관련 파일**: `src/app/api/v1/admin/qc/stats/route.ts`

## 결과

- **타임아웃 안전성**: Railway 컷오프 전 명시적 오류 반환 → 사용자 피드백 개선, 좀비 요청 감소
- **Quality Loop 안정성**: 단일 hang이 전체 루프를 마비시키는 상황 제거
- **오탐 감소**: 자동 제거되는 인라인 스크립트로 인한 생성 실패 제거
- **모니터링 가시성**: Stage 3 폴백 빈도를 데이터로 확인 가능 → 개선 우선순위 결정 근거 확보
- **실성공률 추적**: Admin 대시보드에서 파이프라인 전체 성공률 확인 가능

## 관련 파일

- `src/providers/ClaudeProvider.ts` — 타임아웃 및 Retry-After 처리
- `src/lib/ai/qualityLoop.ts` — 반복당 타임아웃
- `src/lib/qc/validateSecurity.ts` — 인라인 스크립트 강등
- `src/lib/ai/generationPipeline.ts` — STAGE3_FALLBACK_USED 이벤트 발행
- `src/types/events.ts` — DomainEvent 유니온 타입에 STAGE3_FALLBACK_USED 추가
- `src/app/api/v1/admin/qc/stats/route.ts` — failureCount, realSuccessRate 필드 추가
- `docs/architecture/events.md` — 이벤트 타입 문서 갱신
