# ADR: Quality Loop 재활성화 및 ET 전용 타임아웃 분리 (2026-05-03, PR #99)

## 배경

2026-05-03 프로덕션 인시던트([ADR 2026-05-03-production-incident-et-api-migration](2026-05-03-production-incident-et-api-migration.md) 참조)에서 Quality Loop는 두 가지 문제로 인해 비활성화 조치(QUALITY_LOOP_MAX_ITERATIONS=0)가 적용되었다:

1. **타임아웃 오설정**: 운영 환경변수 `QUALITY_LOOP_ITERATION_TIMEOUT_MS=80000`(80초)이 실제 AI 응답 소요 시간(90~150초)보다 짧게 설정되어 재시도가 매번 타임아웃으로 실패
2. **로거 버그**: `qualityLoop.ts`의 `JSON.stringify(Error)` 패턴이 `{}` 빈 객체를 반환하여 타임아웃 에러 내용이 로그에서 소실됨 → 문제를 조기에 발견하지 못하게 된 복합 요인

Quality Loop 비활성화는 즉각적인 안정화를 달성했으나, 재생성 품질 향상 기능 자체가 중단되는 부작용이 있었다. PR #99에서 세 가지 개선 사항을 구현하여 Quality Loop를 재활성화했다.

---

## 결정 사항

### 결정 1: Quality Loop 재활성화 (`QUALITY_LOOP_MAX_ITERATIONS=1`)

**이유**: Quality Loop 비활성화 상태에서는 첫 번째 생성 결과가 품질 기준 미달이어도 재시도 없이 그대로 저장된다. 재생성 품질 저하는 사용자 경험에 직접 영향을 미친다.

**보수적 시작**: 재활성화 시 `QUALITY_LOOP_MAX_ITERATIONS=1`(1회 반복)로 시작. 이전 기본값(2회)보다 낮게 설정한 이유는 총 생성 시간이 Railway의 HTTP 요청 타임아웃(300초) 내에 안전하게 들어오도록 하기 위해서다.

**시간 예산 계산**:
- Stage 1 생성: 최대 ~90초
- Quality Loop 1회 (ET 활성화 시): 최대 ~200초
- 총합: ~290초 → 300초 이내
- Quality Loop 2회 추가 시: 총합이 490초로 타임아웃 초과 위험

운영 안정성이 확인되면 2회로 상향 검토 예정.

---

### 결정 2: ET 전용 타임아웃 분리 (`QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS=200000`)

**이유**: Extended Thinking(ET) 응답은 비-ET 응답보다 훨씬 오래 걸린다. ET 응답은 90~150초 소요가 일반적이며, 기존 단일 타임아웃 변수(`QUALITY_LOOP_ITERATION_TIMEOUT_MS`)로는 두 가지 요구사항을 동시에 충족할 수 없었다:

- 비-ET: 적절한 타임아웃(예: 120~150초) → 빠른 실패 및 재시도 가능
- ET 활성화: 더 긴 타임아웃 필요(200초+) → 정상 완료 보장

**이전 문제**: 단일 타임아웃이 80초로 잘못 설정되어 ET 응답이 완료되기 전에 타임아웃이 발생했다. 타임아웃을 단순히 늘리면 비-ET 요청도 느려지는 부작용이 생긴다.

**분리 설계**:
- `QUALITY_LOOP_ITERATION_TIMEOUT_MS`: 비-ET Quality Loop 반복 타임아웃 (기본: 120,000ms = 120초)
- `QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS`: ET 활성화 시 Quality Loop 반복 타임아웃 (기본: 200,000ms = 200초)

`qualityLoop.ts`는 현재 반복의 ET 활성화 여부를 확인하여 두 환경변수 중 하나를 선택한다. ET 활성화 조건은 `evaluateComplexityScore()` 결과가 `ET_COMPLEXITY_THRESHOLD`(기본: 35점) 이상인 경우이다.

---

### 결정 3: `QUALITY_LOOP_STRICT_ADOPTION` 기본값 `true` (AND 채택 모드)

**이유**: 기존 Quality Loop retry 채택 로직은 OR 방식이었다: `새 품질 점수 > 기존 점수 || 새 모바일 점수 > 기존 점수`. 이 방식은 시소 진동(seesaw oscillation) 문제를 유발한다.

**시소 진동 예시**:
- 1차 생성: 품질 70, 모바일 55 (합계 125)
- 1차 Quality Loop: 품질 65, 모바일 62 → OR 조건: 모바일(62>55) 충족 → 채택
- 실제로는 품질이 70→65로 하락했으나 채택됨

**AND 모드 (`QUALITY_LOOP_STRICT_ADOPTION=true`)**:
- 채택 조건: `(새 품질 >= 기존 품질) AND (새 모바일 >= 기존 모바일)` — 한쪽이 향상되고 다른 쪽이 유지(동등)되는 경우도 허용
- 전체 점수 합산 기준으로 볼 때 퇴행(regression)이 발생하는 retry는 채택하지 않음

**롤백 스위치**: `QUALITY_LOOP_STRICT_ADOPTION=false`로 설정하면 구 OR 동작으로 복원된다. 운영 데이터 비교 시 필요한 경우를 대비한 롤백 스위치다.

---

## 구현 세부 사항

### 타임아웃 선택 로직 (`qualityLoop.ts`)

```typescript
const isEtActive = /* 현재 반복의 ET 활성화 여부 */;
const timeoutMs = isEtActive
  ? (parseInt(process.env.QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS ?? '') || 200_000)
  : (parseInt(process.env.QUALITY_LOOP_ITERATION_TIMEOUT_MS ?? '') || 120_000);
```

### 채택 조건 (`qualityLoop.ts`)

```typescript
const strictAdoption = process.env.QUALITY_LOOP_STRICT_ADOPTION !== 'false';
const adopted = strictAdoption
  ? newQuality >= prevQuality && newMobile >= prevMobile
  : newQuality > prevQuality || newMobile > prevMobile;
```

---

## 결과 및 영향

### 긍정적 영향

- **재생성 품질 회복**: Quality Loop 재활성화로 1회 재시도를 통한 품질 향상 기능 복원
- **타임아웃 안정성**: ET 활성화 요청에서 타임아웃으로 인한 Quality Loop 실패 제거
- **퇴행 방지**: AND 채택 모드로 시소 진동 패턴 방지
- **커버리지**: PR #99 완료 후 Codecov 기준 85.15% 달성

### 한계 및 주의사항

- **1회 제한의 트레이드오프**: 1회 반복으로 복잡한 재생성 요청에서 2회 반복 대비 품질 향상 폭이 제한될 수 있음. 운영 데이터 수집 후 2회 상향 검토 필요
- **단일 인스턴스 전제**: Railway 단일 인스턴스 배포에서만 올바르게 동작. 멀티 인스턴스 시 Redis 기반 외부 상태 저장 필요
- **ET 비용**: ET 활성화 Quality Loop는 추가 AI 토큰 비용 발생. ET_COMPLEXITY_THRESHOLD 조정으로 ET 트리거 빈도 제어 가능

---

## 후속 과제

- [ ] 운영 환경에서 Quality Loop 성공률 및 평균 소요 시간 데이터 수집 (2주)
- [ ] 데이터 기반으로 `QUALITY_LOOP_MAX_ITERATIONS=2` 상향 가능 여부 결정
- [ ] `QUALITY_LOOP_STRICT_ADOPTION` 동작의 A/B 비교 데이터 확인 후 OR 모드 롤백 스위치 제거 검토

---

## 관련 파일

- `src/lib/ai/qualityLoop.ts` — 타임아웃 분리 로직, AND/OR 채택 조건 구현
- `src/lib/config/index.ts` — `QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS` 환경변수 설정 추가
- `docs/reference/env-vars.md` — 신규 환경변수 `QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS`, `QUALITY_LOOP_STRICT_ADOPTION` 문서화
- [ADR 2026-04-29](2026-04-29-generation-success-rate-improvement.md) — Quality Loop 기능 최초 도입 배경
- [ADR 2026-05-03 프로덕션 인시던트](2026-05-03-production-incident-et-api-migration.md) — Quality Loop 비활성화 원인 설명
- [구현 계획](../superpowers/plans/2026-05-03-quality-loop-restoration.md) — PR #99 작업 계획 문서
