# SonarCloud 품질 게이트 통과 설계

**날짜**: 2026-04-26  
**상태**: 승인됨  
**대상 이슈**: 품질 게이트 ERROR (신규 커버리지 31.9% / 기준 80%), HIGH 보안 취약점 1건, 접근성 BUG 3건

---

## 1. 배경 및 목표

SonarCloud 분석 결과:

| 항목 | 현재 | 목표 |
|------|------|------|
| 신규 코드 커버리지 | 31.9% | ≥ 80% |
| 보안 취약점 (HIGH) | 1건 | 0건 |
| 접근성 BUG | 3건 | 0건 |

2개 PR로 분리 수행:
- **Phase 1** — 보안 취약점 + 접근성 BUG (작고 안전한 수정)
- **Phase 2** — 신규 코드 커버리지 80% 달성 (테스트 대량 추가)

---

## 2. Phase 1 — 보안 + 접근성

### 2-1. 보안 취약점: `codeParser.ts:175`

**원인**: DOMPurify에 `ADD_TAGS: ['script', 'style', 'link']` 설정으로 인라인 `<script>` 태그가 필터링 없이 통과됨. `validateSecurity()`는 인라인 스크립트 내용을 검사하지 않아 XSS 공격 가능.

**수정 1 — DOMPurify 설정 (`codeParser.ts:175`)**

```typescript
// Before
ADD_TAGS: ['script', 'style', 'link']

// After
ADD_TAGS: ['style', 'link']
```

근거: Alpine.js는 `buildHeadInjections()`에서 `src=` 속성이 있는 CDN 태그로 주입하므로 `ADD_TAGS`에 `script` 불필요. `style`과 `link`는 CSS 주입에 필수이므로 유지.

**수정 2 — 인라인 스크립트 차단 (`codeValidator.ts`)**

`validateSecurity()` 함수에 규칙 추가:

```typescript
// src 속성 없는 인라인 script 태그 차단
if (/<script(?!\s[^>]*\bsrc\s*=)[^>]*>/i.test(code)) {
  errors.push(t('validation.inlineScriptNotAllowed'));
}
```

i18n 키 추가 (`src/lib/i18n/ko.ts`):
- `validation.inlineScriptNotAllowed`: `"AI 생성 코드에 인라인 스크립트는 허용되지 않습니다."`
- `dialog.closeLabel`: `"닫기"`

**수정 3 — 테스트 (`codeParser.test.ts` 또는 `codeValidator.test.ts`)**

추가 케이스:
- 인라인 `<script>alert(1)</script>` → sanitize 후 제거됨
- `<script src="https://cdn.example.com/lib.js">` → 통과 (src 있음)
- `validateSecurity()`에 인라인 스크립트 포함 시 에러 반환

---

### 2-2. 접근성 BUG 3건

공통 원칙: `onClick`이 있는 비인터랙티브 `<div>`에 키보드 접근성 추가. 시각적 변화 없음.

**`PublishDialog.tsx:247` — 모달 배경(backdrop)**

```tsx
// Before
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  onClick={handleBackdropClick}
>

// After
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  onClick={handleBackdropClick}
  onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') handleBackdropClick(); }}
  role="button"
  tabIndex={0}
  aria-label={t('dialog.closeLabel')}
>
```

**`ApiCard.tsx:43` — API 카드 선택**

```tsx
// Before
<div
  onClick={onSelect}
  className="card group relative cursor-pointer p-5"
  style={isSelected ? { ... } : undefined}
>

// After
<div
  onClick={onSelect}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
  role="button"
  tabIndex={0}
  aria-pressed={isSelected}
  className="card group relative cursor-pointer p-5"
  style={isSelected ? { ... } : undefined}
>
```

**`ApiKeyGuideModal.tsx:14` — 모달 오버레이**

```tsx
// Before
<div
  className="fixed inset-0 z-50 flex items-center justify-center p-4"
  style={{ background: 'rgba(0,0,0,0.7)' }}
  onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>

// After
<div
  className="fixed inset-0 z-50 flex items-center justify-center p-4"
  style={{ background: 'rgba(0,0,0,0.7)' }}
  onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
  role="presentation"
  tabIndex={-1}
>
```

> `role="presentation"` + `tabIndex={-1}`: 스크린리더에 의미 없는 오버레이로 처리, 직접 포커스 없음. Escape 키는 모달 닫기 표준 패턴.

---

### 2-3. Phase 1 영향 범위 및 검증

- `assembleHtml()` 호출 경로: generate, regenerate, preview — 모두 `codeParser.ts` 통과. `script` 제거 후 세 경로 모두 영향 동일하게 적용됨.
- Alpine.js CDN 태그는 `<script src="...">` 형태이므로 `ADD_TAGS`에 `script` 없어도 `buildHeadInjections()` 주입 단계에서 이미 sanitize 이후 추가됨 → 영향 없음.
- `pnpm type-check` + `pnpm lint` + `pnpm test` 통과 확인.

---

## 3. Phase 2 — 신규 코드 커버리지 80% 달성

### 3-1. 커버리지 공백 분석

SonarCloud "신규 코드" 기준: 직전 버전 이후 변경된 코드 (PR #47, 2026-04-26T05:03:09Z 이후).

신규 추가 파일 중 테스트 없는 것이 주요 원인:

| 파일 | 테스트 현황 | 우선순위 |
|------|------------|---------|
| `src/lib/monitoring/slackAlert.ts` | 없음 (신규) | 최고 |
| `src/lib/monitoring/errorRateMonitor.ts` | 없음 (신규) | 최고 |
| `src/services/rateLimitService.ts` | 없음 | 높음 |
| `src/lib/ai/generationTracker.ts` | 없음 | 높음 |
| Drizzle Repositories (우선 3개) | 없음 | 중간 |

### 3-2. 테스트 작성 계획

**`slackAlert.test.ts`** (목표: 8~10개)
- 정상 webhook 호출 (fetch mock)
- SLACK_WEBHOOK_URL 미설정 시 silent skip
- fetch 실패 시 에러 로깅 (서비스 중단 없음)
- 메시지 포맷 검증

**`errorRateMonitor.test.ts`** (목표: 10~12개)
- 5분 슬라이딩 윈도우 이벤트 카운팅
- 임계값 초과 시 Slack 알림 트리거
- 임계값 미달 시 알림 없음
- 윈도우 만료 후 카운터 리셋
- 모듈 레벨 상태 격리 (`vi.resetModules()` + 동적 import 패턴 적용)

**`rateLimitService.test.ts`** (목표: 6~8개)
- 일일 한도 내 증가 성공
- 한도 초과 시 false 반환
- 날짜 경계(자정) 초과화 카운터 리셋

**`generationTracker.test.ts`** (목표: 8~10개)
- `generating` 상태 30분 TTL
- `completed`/`failed` 상태 10분 TTL
- TTL 만료 후 조회 시 undefined
- 싱글톤 상태 격리 (`vi.resetModules()` 패턴)

**Drizzle Repositories (우선 3개)** (목표: 각 4~5개)
- `DrizzleProjectRepository`: create, findById, update (mock DB 또는 MSW)
- `DrizzleEventRepository`: insert, findByProjectId
- `DrizzleCodeRepository`: save, findLatestByProjectId

> **주의**: Drizzle 리포지토리 테스트는 실제 DB 연결이 아닌 mock 방식 적용. `vi.mock('@/lib/supabase/drizzle')` 패턴 사용.

### 3-3. 커버리지 목표 달성 근거

신규 코드 기준이므로 PR #47에 포함된 파일의 테스트가 핵심:
- `slackAlert.ts` + `errorRateMonitor.ts` 테스트 추가 시 신규 코드 커버리지 대폭 상승 예상
- 전체 vitest threshold (lines 45%) 는 현재 71%+ 로 여유 있음
- SonarCloud 신규 코드 80% 달성 = Phase 2 완료 기준

---

## 4. 브랜치 전략

```
feat/sonarcloud-phase1-security-a11y   ← Phase 1
feat/sonarcloud-phase2-coverage        ← Phase 2 (Phase 1 병합 후 시작)
```

두 Phase 모두 각각 PR → main 병합 → Railway 자동 배포.

---

## 5. 완료 기준

- [ ] Phase 1: SonarCloud 취약점 0건, BUG 3건 해소
- [ ] Phase 2: SonarCloud 신규 코드 커버리지 ≥ 80%
- [ ] 품질 게이트 상태 `ERROR` → `OK`
- [ ] `pnpm type-check` + `pnpm lint` + `pnpm test` 모두 통과
- [ ] 두 PR Railway 배포 성공 확인
