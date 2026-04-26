# ADR: SonarCloud 품질 게이트 수정 — 보안·접근성·커버리지 (2026-04-26)

## 배경

SonarCloud 품질 게이트가 FAILED 상태였음:
- **HIGH 보안 취약점 1건 (S8479)**: `codeParser.ts`의 DOMPurify 설정이 `ADD_TAGS: ['script', 'style', 'link']`를 허용하여 AI 생성 HTML에서 스크립트 주입이 가능한 상태
- **접근성 BUG 3건 (S1082)**: `onClick` 핸들러만 있고 키보드 이벤트 없는 인터랙티브 요소
  - `ApiCard.tsx`: API 선택 카드 (`div` + `onClick`)
  - `PublishDialog.tsx`: 모달 백드롭 (`div` + `onClick`)
  - `ApiKeyGuideModal.tsx`: 모달 백드롭 (`div` + `onClick`)
- **신규 코드 커버리지 31.9% (목표 80%)**: `slackAlert.ts`, `errorRateMonitor.ts`, `generationTracker.ts` 테스트 미작성

---

## Phase 1: 보안 취약점 + 접근성 BUG (PR #49)

### 보안 — DOMPurify ADD_TAGS 제거 (S8479)

**문제**: `DOMPurify.sanitize(html, { ADD_TAGS: ['script', 'style', 'link'] })`는 AI가 생성한 HTML의 스크립트 태그를 그대로 통과시킴. SonarQube S8479 HIGH.

**결정**: `ADD_TAGS` 옵션을 완전 제거. `script`/`style`/`link` 세 태그 모두 허용하지 않음.

**안전성 보장**:
- CSS: `parsed.css`로 별도 파싱 → `sanitizeCss()` → `<style>` 태그로 직접 주입 (DOMPurify 경로와 무관)
- Alpine.js: DOMPurify 이후 `buildHeadInjections()`가 CDN `src=` 태그를 `</head>` 앞에 주입

**codeValidator 보강**: `validateSecurity()`에 인라인 `<script>` 차단 규칙 추가.
```typescript
// src 속성 없는 script 태그만 차단 (CDN 태그는 허용)
if (/<script(?!\s[^>]*\bsrc\s*=)[^>]*>/i.test(code)) {
  errors.push('AI 생성 코드에 인라인 스크립트는 허용되지 않습니다.');
}
```

### 접근성 — 키보드 이벤트 누락 (S1082)

**ApiCard.tsx**: `div` → `<button type="button">` 변환.
- 브라우저가 Enter/Space 키 natively 처리하므로 별도 `onKeyDown` 불필요
- `aria-pressed={isSelected}` 추가로 선택 상태 알림
- `w-full text-left` 클래스 추가로 버튼 기본 스타일 리셋

**PublishDialog.tsx**: 이미 `useEffect`에서 document level Escape 처리 중.
- 백드롭에 `onKeyDown` + `tabIndex={0}` 추가 (S1082 요건 충족)
- `role="button"` 미사용 — 백드롭 div에 잘못된 역할 부여 방지 (S6819)

**ApiKeyGuideModal.tsx**: 백드롭을 독립 `<button>`으로 분리하는 방식 채택.
```tsx
// 백드롭 button (절대 위치, 전체 화면 커버)
<button type="button" className="absolute inset-0" onClick={onClose} aria-label="닫기" />
// 모달 콘텐츠 (z-10으로 위에 렌더링)
<div className="relative z-10 ...">...</div>
```
- `useEffect`로 document level Escape 처리 추가 (PublishDialog 패턴과 통일)
- 배열 key 인덱스(`key={i}`) → `key={step.title}` / `key={tip}` 으로 수정 (S6479)

---

## Phase 2: 신규 코드 커버리지 향상 (PR #50)

### 테스트 대상 선정 기준

SonarCloud "신규 코드" 기준으로 커버리지가 낮은 파일을 우선 선정:
- `slackAlert.ts`: 외부 Webhook 연동, no-op 분기가 있어 경계값 테스트 필요
- `errorRateMonitor.ts`: 모듈 레벨 상태 (`count`, `alerted`, `monitorRegistered`) 격리가 핵심
- `generationTracker.ts`: TTL 기반 자동 cleanup — `vi.useFakeTimers()` 없이는 검증 불가

### 테스트 패턴

**slackAlert.test.ts** — `vi.spyOn(globalThis, 'fetch')`:
- `SLACK_WEBHOOK_URL` 미설정 시 fetch 미호출 확인 (no-op 경로)
- HTTP 실패·fetch 예외 모두 에러 미전파 확인 (always resolves)

**errorRateMonitor.test.ts** — `vi.resetModules()` 패턴 (eventPersister와 동일):
- `vi.mock`은 hoisted 선언, `beforeEach`에서 `vi.resetModules() + vi.clearAllMocks()`
- 각 테스트에서 `await import('./errorRateMonitor')` → 모듈 레벨 상태 매번 초기화
- eventBus.on 콜백 추출 후 직접 호출로 임계값 검증

**generationTracker.test.ts** — `vi.useFakeTimers()`:
- `vi.resetModules()` 후 동적 import → 싱글톤의 `setInterval`이 fake timer 하에 생성됨
- `vi.advanceTimersByTime(31 * 60 * 1000)` → cleanup interval 연속 실행으로 TTL 검증
- `stopCleanup()` 호출로 `clearInterval` 후 `vi.useRealTimers()` 복원

---

## 결과

| 항목 | 이전 | 이후 |
|------|------|------|
| SonarCloud 보안 HIGH | 1건 | 0건 |
| SonarCloud 접근성 BUG | 3건 | 0건 |
| Vitest 파일 수 | 82개 | 85개 |
| Vitest 테스트 수 | 1,102개 | 1,116개 |
| 품질 게이트 | FAILED | PASSED (예정) |

---

## 관련 PR

- PR #49: [fix: SonarCloud Phase 1 — 보안(S8479) + 접근성(S1082)](https://github.com/xzawed/CustomWebService/pull/49)
- PR #50: [test: SonarCloud Phase 2 — 커버리지 향상](https://github.com/xzawed/CustomWebService/pull/50)
