# ADR: 정확도 게이트 회귀 방지·가시화·개선 통합 작업 (2026-04-30)

> **언제 읽나**: staticNeedsStage2·hardcodedArrayCount, placeholderPatterns, QUALITY_LOOP_STRICT_ADOPTION, generationTracker/proxy LRUMap, STAGE_SKIPPED/QUALITY_LOOP_COMPLETED·qc-stats 가시화를 손댈 때

## 배경

프로덕션 운영 중 AI 코드 생성 서비스(slug.xzawed.xyz). 사용자가 입력한 컨텍스트와 선택한 API에 맞춰 HTML/CSS/JS를 생성. **사용자 페이지가 요구사항대로 정확하게 생성되는 것이 최우선** 요구사항.

기존 ADR 2026-04-29(생성 성공률 개선 Phase 2)에서 `STAGE3_FALLBACK_USED` 이벤트와 `realSuccessRate` 지표가 추가됐으나, 운영 정확도를 보호하고 측정하기 위한 다음 단계가 필요했다:

1. 정확도 직결 로직(Stage 트리거 / placeholder 검출 / Quality Loop 채택 / DOMPurify 정책 / hardcodedArray 감지)의 **회귀 방지 테스트 부재** — 코드 변경 시 정확도 하락이 자동 차단되지 않음
2. 정확도 신호의 80%는 codeValidator·generationPipeline·qualityLoop 내부에 존재하지만, 이벤트로 발행되거나 Admin Stats에 노출되는 비율은 25% 미만 — **운영자가 정확도 추세를 시계열로 측정 불가**
3. 일부 정확도 게이트에 명백한 약점 발견 — Stage 2 트리거에 hardcodedArrayCount 미포함, placeholder blocklist 분산, Quality Loop의 시소 진동, 재생성 feedback이 Quality Loop에 누적되지 않음
4. 인메모리 자료구조의 메모리 누수 위험 — `proxyRateLimit` Map과 `generationTracker` Map이 size cap 없이 누적 가능

## 결정 사항

위험 매우 낮음 + 효과 명확한 작업만 묶어 한 PR로 처리. 위험이 중간 이상인 작업(`/site/[slug]` 서버 캐시, 거대 모듈 분해)은 별도 분기 작업으로 분리.

### B 단계 — 정확도 게이트 회귀 방지 테스트 (코드 동작 변경 0건)

**S1**: Stage 3 skip boundary 6 cases — `structuralScore` 79/80, `mobileScore` 69/70, `fetchCallCount=0`, `placeholderCount>0`
**S2**: placeholder 정규식 엣지케이스 14 cases — 한국어/영어/날짜/이름, 정상 데이터 미매칭
**S3**: Quality Loop 반복 경계 3 cases — 0회/빈응답/3회 한계
**S4**: assembleHtml DOMPurify 정책 6 cases — Alpine 보존, 인라인 핸들러 제거, javascript: scheme 차단
**S5**: hardcodedArrayCount 감지 패턴 7 cases — 단일/다중/대문자/빈 배열/원시값/다중라인

### A 단계 — 정확도 가시화 (운영 코드 1줄급 추가)

**S6 (A-1)**: `STAGE3_FALLBACK_USED` 카운트·비율을 Admin QC Stats에 노출 (이미 발행 중인 이벤트 활용)
**S7 (A-4)**: `STAGE_SKIPPED` 신규 이벤트 + Admin Stats `stage2SkipCount`·`stage3SkipCount`·`stage2SkipRate`·`stage3SkipRate` 4개 필드
**S8 (A-2)**: `QUALITY_LOOP_COMPLETED` 신규 이벤트 + `avgQualityLoopIterations`·`qualityLoopImprovementRate` 필드. iteration 카운터를 metadata의 `qualityLoopUsed` boolean과 동일 시점에 갱신

**S9 (A-3) 보류**: `CODE_QUALITY_METRICS` 이벤트는 `generation_codes.metadata`와 정보 중복으로 후순위 강등. 시계열 분석이 절실해지면 metadata 시계열 쿼리로 대체

### 정확도 직접 개선

**#1**: `staticNeedsStage2` 조건에 `|| stage1Quality.hardcodedArrayCount > 0` 추가 — mock 데이터를 Stage 2에서 즉시 차단 (기존엔 Quality Loop에서만 잡음)
**#2**: `placeholderPatterns.ts`에 `getPlaceholderBlocklistText()` helper 추가, `promptBuilder.ts`(3곳)와 `qualityLoop.ts`의 인라인 blocklist 문자열을 helper로 통일 — 프롬프트와 검증 일치
**S10**: `buildQualityImprovementPrompt`에 `userFeedback` 파라미터 추가, `runQualityLoop`이 `extraMetadata.userFeedback`을 받아 Quality Loop 3회 동안 사용자 요청을 매번 재주입
**S12**: Quality Loop 채택 기준에 AND 가드 — 한 점수 향상 + 다른 점수 동등 이상일 때만 채택. `QUALITY_LOOP_STRICT_ADOPTION=false`로 기존 OR 로직 즉시 롤백 가능 (운영 데이터 비교용)

### 안정성 개선

**S11**: `src/lib/utils/lruMap.ts` 신규 — Map의 insertion order 기반 자체 LRU(외부 dep 0). `proxy/route.ts`의 rate limit Map을 `LRUMap(1000)`으로 교체
**S14**: 동일 LRUMap을 `generationTracker`에도 적용 — `MAX_TRACKER_ENTRIES=10000`. 정상 트래픽은 TTL이 먼저 정리, 비정상 트래픽 시 LRU evict로 메모리 누적 차단

### 인덱스

**#3**: `019_admin_stats_indexes.sql` — `generated_codes(created_at)` 단독 인덱스 추가. 기존 `idx_generated_codes_project_created`는 project_id가 leading이라 admin/qc-stats의 `findMetadataByDateRange`(project_id 없는 created_at 범위 쿼리)에서 효율 낮았음. `platform_events(type, created_at)` 인덱스는 008에 이미 존재해 S6/S7/S8 쿼리가 자동 지원됨

### 통합 검증

**S15**: `runGenerationPipeline`이 `extraMetadata.userFeedback`을 추출해 `runQualityLoop` 9번째 인자로 전달하는 동작이 침묵하게 깨지지 않도록 통합 테스트 3건 추가

## 결과

- **테스트 1225 → 1388 (+163)** — 정확도 게이트 회귀 방지망 + 가시화 이벤트 + 안정성 회귀 방지 모두 자동 차단 가능
- **`pnpm type-check`, `pnpm lint`, `pnpm test` 모두 통과**
- 운영 코드 변경은 1줄~수 줄급 + 환경변수 토글로 즉시 롤백 가능
- 회귀 위험 평가: 모든 작업이 매우 낮음 또는 낮음 (S12만 중 — env 토글로 mitigation)

## 리스크와 mitigation

- S12 채택 기준 강화는 **기존 동작 변경**이므로 시소 진동을 허용하던 케이스가 거부될 수 있음 → `QUALITY_LOOP_STRICT_ADOPTION=false`로 즉시 롤백
- S6/S7/S8 신규 이벤트로 DB 쓰기 부하가 생성 1건당 4 → 7개로 약 1.7배 증가 → Supabase JSONB INSERT는 ms 단위라 안전, 모니터링 필요
- LRUMap evict 시 사용자 가시성 영향 — `MAX_TRACKER_ENTRIES=10000`은 동시 활성 사용자 한계로 정상 트래픽에서는 TTL이 먼저 정리되어 evict 발생 안 함

## 보류·후속 작업

- **`/site/[slug]` 서버 측 캐싱** — `unstable_cache` + `revalidateTag` 전략. 무효화 정책 잘못 설계 시 게시 해제된 페이지 노출 위험. 운영 데이터(반복 방문 비율) 확인 후 별도 분기 작업으로 진행 권장
- **거대 모듈 분해** — `promptBuilder.ts` 1407줄, `generationPipeline.ts` 348줄, `qcChecks.ts` 684줄. 정확도 회귀 방지 테스트(S1~S5)가 안전망 역할 가능하나 노력 M~L
- **거대 React 컴포넌트 분해** — `RePromptPanel.tsx` 406줄, `PublishDialog.tsx` 443줄, `builder/page.tsx` 877줄. 컴포넌트 테스트가 회귀 방지 작용
- **DNS Rebinding IPv6 추가 검증** — 이론적 우려, 실제 PoC 없으면 우선순위 낮음

## 관련 파일

### 정확도 게이트 회귀 방지 (B)
- `src/lib/ai/generationPipeline.integration.test.ts` — Stage 3 boundary, hardcodedArray, S15 통합 검증
- `src/lib/ai/placeholderPatterns.test.ts` — 정규식 엣지케이스
- `src/lib/ai/qualityLoop.test.ts` — 반복 경계, 채택 기준, feedback 누적
- `src/lib/ai/codeParser.test.ts` — DOMPurify 정책, Alpine 보존
- `src/lib/ai/codeValidator.test.ts` — hardcodedArray 패턴

### 정확도 가시화 (A)
- `src/types/events.ts` — `STAGE_SKIPPED`, `QUALITY_LOOP_COMPLETED` union 확장
- `src/lib/ai/generationPipeline.ts` — emit 호출 추가
- `src/lib/ai/qualityLoop.ts` — iterationsRun 카운터 + emit
- `src/app/api/v1/admin/qc-stats/route.ts` — `stage3FallbackCount`, `stage2/3SkipCount`, `avgQualityLoopIterations` 등 9개 신규 필드

### 정확도 직접 개선
- `src/lib/ai/generationPipeline.ts` — `staticNeedsStage2`에 hardcodedArrayCount 추가, `userFeedback` 추출
- `src/lib/ai/placeholderPatterns.ts` — `getPlaceholderBlocklistText()` helper
- `src/lib/ai/promptBuilder.ts` — 3곳의 인라인 blocklist를 helper 호출로 통일
- `src/lib/ai/qualityLoop.ts` — `userFeedback` 파라미터, AND 가드 + env 토글

### 안정성 / 인덱스
- `src/lib/utils/lruMap.ts` (신규), `src/lib/utils/lruMap.test.ts`
- `src/app/api/v1/proxy/route.ts` — LRUMap 적용
- `src/lib/ai/generationTracker.ts` — LRUMap 적용
- `supabase/migrations/019_admin_stats_indexes.sql` (신규)

### 문서
- `docs/reference/env-vars.md` — `QUALITY_LOOP_STRICT_ADOPTION` 환경변수 추가
