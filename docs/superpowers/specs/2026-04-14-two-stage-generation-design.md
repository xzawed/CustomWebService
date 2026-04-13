# 2단계 생성 파이프라인 설계 (Two-Stage Generation)

## 배경 및 목적

현재 단일 AI 호출로 구조·디자인·인터랙션을 한 번에 생성하는 방식은 AI가 두 가지 서로 다른 책임(기능 구현 + 시각 폴리시)을 동시에 처리해야 해서 품질이 분산된다. 두 단계로 분리하면 각 AI 호출이 집중적인 역할을 수행하여 최종 품질이 향상된다.

**대상 범위:** 초기 생성 + 재생성(피드백 기반 수정) 모두 적용.  
**UX 방침:** 사용자는 두 단계가 모두 완료된 최종 결과만 확인한다(중간 결과 미표시).

---

## 아키텍처

### 단계별 책임

**Stage 1 — 구조 & 기능 (진행률 0 → 45%)**

- 담당: HTML 시맨틱 구조, 반응형 레이아웃, 목 데이터(20개+ 한국어), API 연동(fetch), 탭·검색·모달·필터 등 인터랙션 로직
- 제외: 애니메이션, 디자인 시스템 폴리시, 마이크로 인터랙션, 스켈레톤 UI
- 결과: 기능은 완전하지만 시각적으로 미완성인 코드
- DB 저장: 없음 (중간 산출물)

**Stage 2 — 디자인 & 폴리시 (진행률 45 → 90%)**

- 입력: Stage 1 출력물 전체 (HTML + CSS + JS)
- 담당: 디자인 시스템 선택·적용, `@keyframes` 페이지 진입 애니메이션, 스켈레톤 UI, 토스트 알림, 버튼 로딩 상태·리플 효과, Empty State UI 3종, 타이포그래피 정제
- 방식: Stage 1 코드를 수정(재작성 아님) — 기능·데이터는 유지, 시각 레이어만 추가
- QC: Stage 2 결과물에만 적용

**저장 & QC (진행률 90 → 100%)**

- 기존 방식과 동일
- Stage 2 최종 결과물만 `codeRepo.create()` 저장

---

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/ai/promptBuilder.ts` | `buildStage1SystemPrompt()`, `buildStage1UserPrompt()`, `buildStage2SystemPrompt()`, `buildStage2UserPrompt(stage1Code)` 추가 |
| `src/lib/ai/generationPipeline.ts` | `runStage1()`, `runStage2()` 내부 함수 추가; `runGenerationPipeline()` 오케스트레이션 변경 |
| `src/app/api/v1/generate/route.ts` | 변경 없음 |
| `src/app/api/v1/generate/regenerate/route.ts` | 변경 없음 |
| `src/__tests__/lib/ai/generationPipeline.test.ts` | 2단계 흐름 테스트 추가 |

---

## SSE 이벤트 & 진행률

기존 `progress` 이벤트 필드 구조(`step`, `progress`, `message`)를 유지하고 새 `step` 값만 추가한다. 클라이언트(빌더 UI)는 수정 없이 그대로 동작한다.

| step 값 | progress | message |
|---------|----------|---------|
| `stage1_generating` | 5 → 40% | `1단계: 구조 및 기능 생성 중...` |
| `stage1_complete` | 45% | `구조 완성. 디자인 적용 준비 중...` |
| `stage2_generating` | 50 → 82% | `2단계: 디자인 및 인터랙션 적용 중...` |
| `validating` | 85% | (기존 그대로) |
| `saving` | 92% | (기존 그대로) |
| `complete` | 100% | (기존 그대로) |

---

## Stage 2 프롬프트 설계

### 시스템 프롬프트

Stage 1 시스템 프롬프트에서 레이아웃·데이터·기능 관련 지시를 제거하고 시각 폴리시만 집중 지시:

- 8종 디자인 시스템 중 서비스에 맞는 1개 선택·전면 적용
- `@keyframes fadeInUp / fadeIn / slideInRight` 페이지 진입 애니메이션 필수
- 스켈레톤 UI (DOMContentLoaded → 300ms → 실제 데이터 교체 패턴)
- 토스트 알림 — 모든 API 성공·실패·사용자 액션에 필수
- 버튼 로딩 상태(`setButtonLoading`) + 리플 효과(`.ripple-btn`)
- Empty State UI 3종 (검색 0건 / 즐겨찾기 없음 / 에러)
- 타이포그래피 위계 강화 (H1 > H2 > H3 > 본문 > 캡션)

### 유저 프롬프트 구조

```
다음은 1단계에서 생성된 구조 코드입니다.
기능과 데이터는 이미 완성되어 있으므로 수정하지 마세요.
디자인 시스템, 애니메이션, 마이크로 인터랙션만 추가·강화하여 전체 코드를 반환하세요.

### HTML (1단계)
```html
{stage1.html}
```
### CSS (1단계)
```css
{stage1.css}
```
### JavaScript (1단계)
```javascript
{stage1.js}
```
```

### 토큰 예산

Stage 1 출력물이 Stage 2 입력에 포함된다. 일반적인 생성 결과물 기준 ~3,000 토큰이며, `claude-sonnet-4-6` 200K 컨텍스트 한도 내에서 여유롭다.

---

## 재생성 적용

재생성도 동일한 2단계 파이프라인을 거친다.

- Stage 1 유저 프롬프트: 이전 코드 + 피드백 → 구조·기능 수정 적용
- Stage 2 유저 프롬프트: Stage 1 결과 + 동일 피드백 인지 → 디자인 레이어도 피드백 반영
- `buildStage2RegenerationUserPrompt(stage1Code, feedback)` 별도 함수로 분리

---

## 에러 처리

- Stage 1 실패 → 즉시 `error` SSE 이벤트 발행, Stage 2 진입 안 함
- Stage 2 실패 → `error` SSE 이벤트 발행 (Stage 1 결과물은 저장하지 않음)
- Stage 2 품질 루프 실패(2회 초과) → 가장 높은 점수의 Stage 2 결과물 저장 (기존 방식과 동일)

---

## 테스트 전략

- `runStage1()` 단위 테스트: AI mock → 파싱된 코드 반환 확인
- `runStage2()` 단위 테스트: Stage 1 코드 입력 → 폴리시된 코드 반환 확인
- `runGenerationPipeline()` 통합 테스트: Stage 1 → Stage 2 순서 보장, SSE step 순서 확인
- 기존 통합 테스트(`generate.test.ts`, `regenerate.test.ts`) 전부 통과 유지
