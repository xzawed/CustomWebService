# SonarCloud 품질 게이트 통과 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SonarCloud 품질 게이트를 ERROR → OK로 전환 — HIGH 보안 취약점 1건 해소, 접근성 BUG 3건 수정, 신규 코드 커버리지 31.9% → 80% 달성

**Architecture:** Phase 1(보안+접근성) → Phase 2(커버리지) 순서로 각각 별도 브랜치·PR. Phase 1은 코드 로직 수정, Phase 2는 테스트 추가만.

**Tech Stack:** TypeScript, React 19, DOMPurify, Vitest, happy-dom

---

## Phase 1 — 보안 + 접근성

### Task 1: Phase 1 브랜치 생성

**Files:** 없음

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout -b feat/sonarcloud-phase1-security-a11y
```

Expected: `Switched to a new branch 'feat/sonarcloud-phase1-security-a11y'`

---

### Task 2: codeParser.ts — ADD_TAGS에서 script 제거

**Files:**
- Modify: `src/lib/ai/codeParser.ts` (line ~176)

**배경:** DOMPurify 기본값은 `<script>` 태그를 제거한다. `ADD_TAGS`에 추가하면 필터링 우회. Alpine.js는 `buildHeadInjections()`가 sanitize 이후에 CDN `<script src="...">` 태그를 직접 삽입하므로 `ADD_TAGS`에 `script`가 없어도 동작한다.

- [ ] **Step 1: codeParser.ts 수정**

`src/lib/ai/codeParser.ts`에서 아래를 찾아 수정:

```typescript
// Before (line ~176)
const safeHtml = DOMPurify.sanitize(parsed.html, {
  WHOLE_DOCUMENT: isFullDoc,
  FORCE_BODY: !isFullDoc,
  ADD_TAGS: ['script', 'style', 'link'],
});

// After
const safeHtml = DOMPurify.sanitize(parsed.html, {
  WHOLE_DOCUMENT: isFullDoc,
  FORCE_BODY: !isFullDoc,
  ADD_TAGS: ['style', 'link'],
});
```

- [ ] **Step 2: 타입 체크**

```bash
pnpm type-check 2>&1 | tail -5
```

Expected: 에러 없음

---

### Task 3: codeValidator.ts — 인라인 script 차단 규칙 추가

**Files:**
- Modify: `src/lib/ai/codeValidator.ts` (validateSecurity 함수)

**배경:** DOMPurify에서 `script`를 제거해도 `validateSecurity()`에 명시적 차단 규칙이 없으면 AI가 `<script>` 태그가 포함된 코드를 생성해 regenerate 등 다른 경로에서 통과될 수 있다. 방어 레이어 추가.

- [ ] **Step 1: validateSecurity에 인라인 스크립트 차단 추가**

`src/lib/ai/codeValidator.ts`의 `validateSecurity()` 함수에서 기존 `eval()` 차단 블록 바로 아래에 추가:

```typescript
// 기존 eval() 차단 다음 줄에 삽입
if (/<script(?!\s[^>]*\bsrc\s*=)[^>]*>/i.test(code)) {
  errors.push('AI 생성 코드에 인라인 스크립트는 허용되지 않습니다.');
}
```

> 정규식 해설: `<script`로 시작하되 `src=` 속성이 없는 경우만 차단. CDN 태그(`<script src="...">`)는 통과.

- [ ] **Step 2: 타입 체크**

```bash
pnpm type-check 2>&1 | tail -5
```

Expected: 에러 없음

---

### Task 4: codeValidator.test.ts — 인라인 스크립트 차단 테스트 추가

**Files:**
- Modify: `src/lib/ai/codeValidator.test.ts`

- [ ] **Step 1: 실패할 테스트 작성**

`src/lib/ai/codeValidator.test.ts`의 `validateSecurity` describe 블록 안에 추가:

```typescript
it('인라인 script 태그가 있으면 에러를 반환한다', () => {
  const result = validateSecurity('<script>alert(1)</script>');
  expect(result.isValid).toBe(false);
  expect(result.errors.some((e) => e.includes('인라인 스크립트'))).toBe(true);
});

it('src 속성이 있는 script 태그는 허용한다', () => {
  const result = validateSecurity('<script src="https://cdn.example.com/lib.js"></script>');
  expect(result.errors.some((e) => e.includes('인라인 스크립트'))).toBe(false);
});

it('script 없는 정상 HTML은 인라인 스크립트 에러 없음', () => {
  const result = validateSecurity('<div class="app"><h1>Hello</h1></div>');
  expect(result.errors.some((e) => e.includes('인라인 스크립트'))).toBe(false);
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test src/lib/ai/codeValidator.test.ts 2>&1 | tail -20
```

Expected: 새로 추가한 3개 테스트 FAIL (Task 3 미적용 상태라면), Task 3 적용 후 PASS

- [ ] **Step 3: 전체 테스트 실행**

```bash
pnpm test src/lib/ai/codeValidator.test.ts 2>&1 | tail -10
```

Expected: 전체 PASS

---

### Task 5: codeParser.test.ts — sanitize 후 script 제거 테스트 추가

**Files:**
- Modify: `src/lib/ai/codeParser.test.ts`

- [ ] **Step 1: 테스트 추가**

`src/lib/ai/codeParser.test.ts`의 적절한 describe 블록에 추가:

```typescript
it('assembleHtml이 인라인 script 태그를 제거한다', () => {
  const code = {
    html: '<div><script>alert("xss")</script><p>Hello</p></div>',
    css: 'p { color: red; }',
    js: '',
  };
  const result = assembleHtml(code);
  expect(result).not.toContain('<script>alert');
  expect(result).toContain('<p>Hello</p>');
});

it('assembleHtml이 Alpine.js CDN script 태그를 포함한다', () => {
  const code = {
    html: '<div x-data="{}"><p>Hello</p></div>',
    css: '',
    js: '',
  };
  const result = assembleHtml(code);
  expect(result).toContain('alpinejs');
});
```

- [ ] **Step 2: 테스트 실행**

```bash
pnpm test src/lib/ai/codeParser.test.ts 2>&1 | tail -10
```

Expected: 전체 PASS

- [ ] **Step 3: Phase 1 보안 수정 커밋**

```bash
git add src/lib/ai/codeParser.ts src/lib/ai/codeValidator.ts \
        src/lib/ai/codeParser.test.ts src/lib/ai/codeValidator.test.ts
git commit -m "fix: DOMPurify ADD_TAGS script 제거 및 인라인 스크립트 차단 규칙 추가"
```

---

### Task 6: PublishDialog.tsx — 모달 배경 키보드 접근성

**Files:**
- Modify: `src/components/dashboard/PublishDialog.tsx` (line ~246)

- [ ] **Step 1: 수정**

`src/components/dashboard/PublishDialog.tsx`에서 아래 패턴을 찾아 수정:

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
  onKeyDown={(e) => {
    if (e.key === 'Escape' || e.key === 'Enter') handleBackdropClick();
  }}
  role="button"
  tabIndex={0}
  aria-label="닫기"
>
```

- [ ] **Step 2: 타입 체크 + 린트**

```bash
pnpm type-check 2>&1 | tail -5 && pnpm lint src/components/dashboard/PublishDialog.tsx 2>&1 | tail -5
```

Expected: 에러 없음

---

### Task 7: ApiCard.tsx — 카드 선택 키보드 접근성

**Files:**
- Modify: `src/components/catalog/ApiCard.tsx` (line ~43)

- [ ] **Step 1: 수정**

`src/components/catalog/ApiCard.tsx`에서 아래 패턴을 찾아 수정:

```tsx
// Before
<div
  onClick={onSelect}
  className="card group relative cursor-pointer p-5"
  style={isSelected ? { borderColor: 'var(--accent-primary)', boxShadow: 'var(--shadow-glow)' } : undefined}
>

// After
<div
  onClick={onSelect}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  }}
  role="button"
  tabIndex={0}
  aria-pressed={isSelected}
  className="card group relative cursor-pointer p-5"
  style={isSelected ? { borderColor: 'var(--accent-primary)', boxShadow: 'var(--shadow-glow)' } : undefined}
>
```

- [ ] **Step 2: 타입 체크 + 린트**

```bash
pnpm type-check 2>&1 | tail -5 && pnpm lint src/components/catalog/ApiCard.tsx 2>&1 | tail -5
```

Expected: 에러 없음

---

### Task 8: ApiKeyGuideModal.tsx — 모달 오버레이 키보드 접근성

**Files:**
- Modify: `src/components/settings/ApiKeyGuideModal.tsx` (line ~14)

- [ ] **Step 1: 수정**

`src/components/settings/ApiKeyGuideModal.tsx`에서 아래 패턴을 찾아 수정:

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

- [ ] **Step 2: 타입 체크 + 린트**

```bash
pnpm type-check 2>&1 | tail -5 && pnpm lint src/components/settings/ApiKeyGuideModal.tsx 2>&1 | tail -5
```

Expected: 에러 없음

- [ ] **Step 3: 접근성 수정 커밋**

```bash
git add src/components/dashboard/PublishDialog.tsx \
        src/components/catalog/ApiCard.tsx \
        src/components/settings/ApiKeyGuideModal.tsx
git commit -m "fix: 접근성 BUG 3건 — 비인터랙티브 div에 키보드 리스너 추가"
```

---

### Task 9: Phase 1 최종 검증 및 PR

**Files:** 없음

- [ ] **Step 1: 전체 테스트**

```bash
pnpm test 2>&1 | tail -15
```

Expected: 전체 PASS, 기존 테스트 리그레션 없음

- [ ] **Step 2: 전체 린트 + 타입 체크**

```bash
pnpm lint 2>&1 | tail -10 && pnpm type-check 2>&1 | tail -10
```

Expected: 에러 없음

- [ ] **Step 3: push 및 PR 생성**

```bash
git push -u origin feat/sonarcloud-phase1-security-a11y
gh pr create \
  --title "fix: SonarCloud Phase1 — 보안 취약점(HIGH) + 접근성 BUG 3건 해소" \
  --body "$(cat <<'EOF'
## Summary
- codeParser.ts: DOMPurify ADD_TAGS에서 script 제거 (XSS 방어)
- codeValidator.ts: 인라인 스크립트 차단 규칙 추가
- PublishDialog.tsx / ApiCard.tsx / ApiKeyGuideModal.tsx: 키보드 접근성 추가

## SonarCloud 해소 항목
- HIGH 보안 취약점 1건 (codeParser.ts:175)
- 접근성 BUG 3건 (S1082)

## Test plan
- [ ] pnpm test 전체 통과
- [ ] pnpm lint / type-check 통과
- [ ] Railway 배포 후 generate/preview/site 동작 확인 (Alpine.js 동작 유지)
EOF
)"
```

- [ ] **Step 4: PR main 병합 후 main으로 복귀**

```bash
git checkout main && git pull origin main
```

---

## Phase 2 — 신규 코드 커버리지 80% 달성

### Task 10: Phase 2 브랜치 생성

**Files:** 없음

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout -b feat/sonarcloud-phase2-coverage
```

Expected: `Switched to a new branch 'feat/sonarcloud-phase2-coverage'`

---

### Task 11: slackAlert.test.ts 작성

**Files:**
- Create: `src/lib/monitoring/slackAlert.test.ts`

**배경:** `slackAlert.ts`는 `SLACK_WEBHOOK_URL` 환경변수가 없으면 no-op, 있으면 fetch로 webhook 호출. fetch 실패 시 에러 로깅만 하고 throw 안 함.

- [ ] **Step 1: 테스트 파일 작성**

`src/lib/monitoring/slackAlert.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendSlackAlert } from './slackAlert';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SLACK_WEBHOOK_URL;
});

describe('sendSlackAlert', () => {
  it('SLACK_WEBHOOK_URL이 없으면 fetch를 호출하지 않는다', async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    await sendSlackAlert({ level: 'error', title: '테스트', message: '메시지' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('SLACK_WEBHOOK_URL이 있으면 webhook으로 POST 요청을 보낸다', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    mockFetch.mockResolvedValueOnce({ ok: true });

    await sendSlackAlert({ level: 'error', title: '에러 발생', message: '상세 내용' });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/test',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('요청 body에 title과 message가 포함된다', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    mockFetch.mockResolvedValueOnce({ ok: true });

    await sendSlackAlert({ level: 'warning', title: '경고 제목', message: '경고 내용' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const text = JSON.stringify(body);
    expect(text).toContain('경고 제목');
    expect(text).toContain('경고 내용');
  });

  it('fetch 실패 시 에러를 throw하지 않는다', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    await expect(
      sendSlackAlert({ level: 'error', title: '테스트', message: '메시지' }),
    ).resolves.not.toThrow();
  });

  it('fields 옵션이 있으면 body에 포함된다', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    mockFetch.mockResolvedValueOnce({ ok: true });

    await sendSlackAlert({
      level: 'info',
      title: '정보',
      message: '내용',
      fields: [{ title: '프로젝트', value: 'CustomWebService' }],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const text = JSON.stringify(body);
    expect(text).toContain('CustomWebService');
  });
});
```

- [ ] **Step 2: 테스트 실행**

```bash
pnpm test src/lib/monitoring/slackAlert.test.ts 2>&1 | tail -15
```

Expected: 5개 PASS

- [ ] **Step 3: 커밋**

```bash
git add src/lib/monitoring/slackAlert.test.ts
git commit -m "test: slackAlert 단위 테스트 추가 (5개)"
```

---

### Task 12: errorRateMonitor.test.ts 작성

**Files:**
- Create: `src/lib/monitoring/errorRateMonitor.test.ts`

**배경:** `errorRateMonitor.ts`는 모듈 레벨 상태(`failureWindow`)를 가지므로 테스트 간 상태 격리를 위해 `vi.resetModules()` + 동적 import 패턴 필수 (eventPersister.test.ts와 동일).

- [ ] **Step 1: 테스트 파일 작성**

`src/lib/monitoring/errorRateMonitor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSendSlackAlert = vi.fn();
const mockEventBusOn = vi.fn();
const mockEventBusOff = vi.fn();

vi.mock('@/lib/monitoring/slackAlert', () => ({
  sendSlackAlert: mockSendSlackAlert,
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: {
    on: mockEventBusOn,
    off: mockEventBusOff,
  },
}));

describe('registerErrorRateMonitor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mockSendSlackAlert.mockReset();
    mockEventBusOn.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ERROR_RATE_ALERT_THRESHOLD;
  });

  it('CODE_GENERATION_FAILED 이벤트를 구독한다', async () => {
    const { registerErrorRateMonitor } = await import('./errorRateMonitor');
    registerErrorRateMonitor();
    expect(mockEventBusOn).toHaveBeenCalledWith(
      'CODE_GENERATION_FAILED',
      expect.any(Function),
    );
  });

  it('임계값 미달 시 Slack 알림을 보내지 않는다', async () => {
    process.env.ERROR_RATE_ALERT_THRESHOLD = '5';
    const { registerErrorRateMonitor } = await import('./errorRateMonitor');
    registerErrorRateMonitor();

    const handler = mockEventBusOn.mock.calls[0][1];
    await handler({});
    await handler({});
    await handler({});

    expect(mockSendSlackAlert).not.toHaveBeenCalled();
  });

  it('임계값 초과 시 Slack 알림을 보낸다', async () => {
    process.env.ERROR_RATE_ALERT_THRESHOLD = '3';
    mockSendSlackAlert.mockResolvedValue(undefined);

    const { registerErrorRateMonitor } = await import('./errorRateMonitor');
    registerErrorRateMonitor();

    const handler = mockEventBusOn.mock.calls[0][1];
    await handler({});
    await handler({});
    await handler({});
    await handler({});

    expect(mockSendSlackAlert).toHaveBeenCalledOnce();
  });

  it('임계값 초과 후 중복 알림을 보내지 않는다', async () => {
    process.env.ERROR_RATE_ALERT_THRESHOLD = '2';
    mockSendSlackAlert.mockResolvedValue(undefined);

    const { registerErrorRateMonitor } = await import('./errorRateMonitor');
    registerErrorRateMonitor();

    const handler = mockEventBusOn.mock.calls[0][1];
    await handler({});
    await handler({});
    await handler({});
    await handler({});
    await handler({});

    expect(mockSendSlackAlert).toHaveBeenCalledOnce();
  });

  it('5분 윈도우가 지나면 카운터가 리셋된다', async () => {
    process.env.ERROR_RATE_ALERT_THRESHOLD = '2';
    mockSendSlackAlert.mockResolvedValue(undefined);

    const { registerErrorRateMonitor } = await import('./errorRateMonitor');
    registerErrorRateMonitor();

    const handler = mockEventBusOn.mock.calls[0][1];
    await handler({});
    await handler({});
    await handler({});

    vi.advanceTimersByTime(6 * 60 * 1000);

    await handler({});
    await handler({});
    await handler({});

    expect(mockSendSlackAlert).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 테스트 실행**

```bash
pnpm test src/lib/monitoring/errorRateMonitor.test.ts 2>&1 | tail -15
```

Expected: 5개 PASS (모듈 구조에 따라 일부 조정 필요 시 수정)

- [ ] **Step 3: 커밋**

```bash
git add src/lib/monitoring/errorRateMonitor.test.ts
git commit -m "test: errorRateMonitor 단위 테스트 추가 (5개)"
```

---

### Task 13: generationTracker.test.ts 작성

**Files:**
- Create: `src/lib/ai/generationTracker.test.ts`

**배경:** `generationTracker.ts`는 모듈 레벨 싱글톤 Map + 1분 cleanup 타이머를 가진다. 테스트 간 격리를 위해 `vi.resetModules()` + 동적 import 패턴, `vi.useFakeTimers()`로 TTL 검증.

- [ ] **Step 1: 테스트 파일 작성**

`src/lib/ai/generationTracker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('generationTracker', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start()로 추적을 시작하면 get()으로 조회할 수 있다', async () => {
    const { generationTracker } = await import('./generationTracker');
    generationTracker.start('user-1', 'proj-1');
    const entry = generationTracker.get('proj-1');
    expect(entry).toBeDefined();
    expect(entry?.status).toBe('generating');
    expect(entry?.userId).toBe('user-1');
  });

  it('complete()를 호출하면 status가 completed로 변경된다', async () => {
    const { generationTracker } = await import('./generationTracker');
    generationTracker.start('user-1', 'proj-1');
    generationTracker.complete('proj-1', { html: '<p>hi</p>', css: '', js: '' });
    const entry = generationTracker.get('proj-1');
    expect(entry?.status).toBe('completed');
  });

  it('fail()을 호출하면 status가 failed로 변경된다', async () => {
    const { generationTracker } = await import('./generationTracker');
    generationTracker.start('user-1', 'proj-1');
    generationTracker.fail('proj-1', '생성 실패');
    const entry = generationTracker.get('proj-1');
    expect(entry?.status).toBe('failed');
    expect(entry?.error).toBe('생성 실패');
  });

  it('generating 상태는 30분 TTL 이후 만료된다', async () => {
    const { generationTracker } = await import('./generationTracker');
    generationTracker.start('user-1', 'proj-1');
    vi.advanceTimersByTime(31 * 60 * 1000);
    const entry = generationTracker.get('proj-1');
    expect(entry).toBeUndefined();
  });

  it('completed 상태는 10분 TTL 이후 만료된다', async () => {
    const { generationTracker } = await import('./generationTracker');
    generationTracker.start('user-1', 'proj-1');
    generationTracker.complete('proj-1', { html: '', css: '', js: '' });
    vi.advanceTimersByTime(11 * 60 * 1000);
    const entry = generationTracker.get('proj-1');
    expect(entry).toBeUndefined();
  });

  it('completed 상태는 10분 이내에는 조회 가능하다', async () => {
    const { generationTracker } = await import('./generationTracker');
    generationTracker.start('user-1', 'proj-1');
    generationTracker.complete('proj-1', { html: '<p>ok</p>', css: '', js: '' });
    vi.advanceTimersByTime(9 * 60 * 1000);
    const entry = generationTracker.get('proj-1');
    expect(entry?.status).toBe('completed');
  });

  it('존재하지 않는 projectId를 get()하면 undefined를 반환한다', async () => {
    const { generationTracker } = await import('./generationTracker');
    expect(generationTracker.get('non-existent')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실행**

```bash
pnpm test src/lib/ai/generationTracker.test.ts 2>&1 | tail -15
```

Expected: 7개 PASS

- [ ] **Step 3: 커밋**

```bash
git add src/lib/ai/generationTracker.test.ts
git commit -m "test: generationTracker 단위 테스트 추가 (7개)"
```

---

### Task 14: Phase 2 최종 검증 및 PR

**Files:** 없음

- [ ] **Step 1: 전체 테스트 + 커버리지 확인**

```bash
pnpm test:coverage 2>&1 | tail -30
```

Expected: 전체 PASS, 신규 파일 커버리지 상승 확인

- [ ] **Step 2: 전체 린트 + 타입 체크**

```bash
pnpm lint 2>&1 | tail -5 && pnpm type-check 2>&1 | tail -5
```

Expected: 에러 없음

- [ ] **Step 3: push 및 PR 생성**

```bash
git push -u origin feat/sonarcloud-phase2-coverage
gh pr create \
  --title "test: SonarCloud Phase2 — 신규 코드 커버리지 80% 달성" \
  --body "$(cat <<'EOF'
## Summary
- slackAlert.test.ts: 5개 테스트 추가
- errorRateMonitor.test.ts: 5개 테스트 추가
- generationTracker.test.ts: 7개 테스트 추가

## SonarCloud 목표
- 신규 코드 커버리지 31.9% → 80%+ 달성
- 품질 게이트 ERROR → OK 전환

## Test plan
- [ ] pnpm test 전체 통과
- [ ] pnpm test:coverage threshold 통과
- [ ] SonarCloud 분석 후 품질 게이트 OK 확인
EOF
)"
```

- [ ] **Step 4: PR main 병합 후 main으로 복귀**

```bash
git checkout main && git pull origin main
```

---

## 완료 기준 체크리스트

- [ ] Phase 1 PR 병합 + Railway 배포 성공
- [ ] Phase 2 PR 병합 + Railway 배포 성공
- [ ] SonarCloud 재분석 후 품질 게이트 `OK`
- [ ] SonarCloud 보안 취약점 0건
- [ ] SonarCloud 접근성 BUG 0건
- [ ] SonarCloud 신규 코드 커버리지 ≥ 80%
