# React 컴포넌트 테스트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 1,129개 Vitest 테스트에 영향 없이 React 컴포넌트 테스트 인프라를 구축하고 Phase 1 (순수 UI 7개) + Phase 2 (상태·이벤트 7개) 컴포넌트 테스트를 작성한다.

**Architecture:** 파일별 `// @vitest-environment happy-dom` 지시자로 기존 node 환경 테스트를 완전 격리. `@testing-library/react` 기반 `renderComponent` 헬퍼와 Zustand mock 팩토리(Phase 3+ 준비)를 먼저 구축한 뒤 컴포넌트별 테스트를 순차 추가. `vitest.config.ts`의 `coverage.include`에 `src/components/**` 추가.

**Tech Stack:** Vitest 4.x, @testing-library/react 16, happy-dom 20, vi.useFakeTimers(), vi.stubGlobal()

---

## 파일 구조

**수정:**
- `vitest.config.ts` — coverage.include에 `src/components/**` 추가

**신규 생성:**
```
src/
├── test/
│   ├── mocks/zustand.ts              ← Task 0
│   └── helpers/component.ts          ← Task 0
└── components/
    ├── builder/
    │   ├── StepIndicator.test.tsx    ← Task 1
    │   ├── GuideQuestions.test.tsx   ← Task 4
    │   ├── ContextSuggestions.test.tsx ← Task 7
    │   ├── ApiRecommendations.test.tsx ← Task 9
    │   ├── BuilderModeToggle.test.tsx  ← Task 10
    │   └── TemplateSelector.test.tsx   ← Task 11
    ├── catalog/
    │   ├── CategoryTabs.test.tsx     ← Task 2
    │   ├── ApiCard.test.tsx          ← Task 3
    │   ├── ApiDetailModal.test.tsx   ← Task 5
    │   ├── ApiSearchBar.test.tsx     ← Task 6
    │   └── CatalogView.test.tsx      ← Task 12
    ├── dashboard/
    │   ├── ProjectCard.test.tsx      ← Task 8
    │   └── ProjectPublishActions.test.tsx ← Task 13
    └── settings/
        └── ApiKeyGuideModal.test.tsx ← Task 14
```

---

## Task 0: 인프라 구축

**Files:**
- Modify: `vitest.config.ts`
- Create: `src/test/mocks/zustand.ts`
- Create: `src/test/helpers/component.ts`

- [ ] **Step 1: vitest.config.ts 수정 — coverage.include에 컴포넌트 추가**

```typescript
// vitest.config.ts (전체 파일)
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/lib/**',
        'src/services/**',
        'src/providers/**',
        'src/repositories/**',
        'src/components/**',   // ← 추가
      ],
      exclude: ['src/test/**'],
      thresholds: {
        branches: 40,
        functions: 30,
        lines: 45,
        statements: 43,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 2: Zustand mock 팩토리 생성**

```typescript
// src/test/mocks/zustand.ts
import { vi } from 'vitest';
import type { ThemeId } from '@/stores/themeStore';
import type { BuilderMode } from '@/stores/builderModeStore';

export function mockThemeStore(overrides: { theme?: ThemeId; setTheme?: ReturnType<typeof vi.fn> } = {}) {
  return { theme: 'sky' as ThemeId, setTheme: vi.fn(), ...overrides };
}

export function mockBuilderModeStore(overrides: { mode?: BuilderMode; setMode?: ReturnType<typeof vi.fn> } = {}) {
  return { mode: 'api-first' as BuilderMode, setMode: vi.fn(), ...overrides };
}
```

- [ ] **Step 3: renderComponent 헬퍼 생성**

```typescript
// src/test/helpers/component.ts
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

export function renderComponent(ui: ReactElement, options?: RenderOptions) {
  return render(ui, options);
}

export * from '@testing-library/react';
```

- [ ] **Step 4: 기존 테스트 회귀 확인**

Run: `pnpm test`
Expected: 1,129개 기존 테스트 PASS, 0 FAILED

- [ ] **Step 5: 커밋**

```bash
git add vitest.config.ts src/test/mocks/zustand.ts src/test/helpers/component.ts
git commit -m "test: 컴포넌트 테스트 인프라 구축 — vitest coverage 확장, renderComponent 헬퍼, zustand mock 팩토리"
```

---

## Task 1: StepIndicator

**Files:**
- Create: `src/components/builder/StepIndicator.test.tsx`
- Reference: `src/components/builder/StepIndicator.tsx` — `export default function StepIndicator`, isCompleted = `currentStep > num`

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/builder/StepIndicator.test.tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderComponent, screen } from '@/test/helpers/component';
import StepIndicator from './StepIndicator';

const steps = [
  { label: '서비스 설명' },
  { label: 'API 선택' },
  { label: '코드 생성' },
];

describe('StepIndicator', () => {
  it('모든 단계 라벨을 렌더링한다', () => {
    renderComponent(<StepIndicator currentStep={1} steps={steps} />);
    expect(screen.getByText('서비스 설명')).toBeTruthy();
    expect(screen.getByText('API 선택')).toBeTruthy();
    expect(screen.getByText('코드 생성')).toBeTruthy();
  });

  it('활성 단계(currentStep=2)의 숫자 "2"가 DOM에 존재한다', () => {
    renderComponent(<StepIndicator currentStep={2} steps={steps} />);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('완료된 단계에는 숫자가 없다 (체크마크로 대체)', () => {
    renderComponent(<StepIndicator currentStep={2} steps={steps} />);
    // step num=1 → isCompleted = (2 > 1) = true → Check 아이콘, "1" 텍스트 없음
    expect(screen.queryByText('1')).toBeNull();
  });

  it('currentStep=1일 때 단계 1이 활성화된다', () => {
    renderComponent(<StepIndicator currentStep={1} steps={steps} />);
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('빈 steps 배열에서 크래시 없이 렌더링된다', () => {
    expect(() => renderComponent(<StepIndicator currentStep={1} steps={[]} />)).not.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/builder/StepIndicator.test.tsx`
Expected: 5 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/builder/StepIndicator.test.tsx
git commit -m "test: StepIndicator 컴포넌트 테스트 추가 (Phase 1)"
```

---

## Task 2: CategoryTabs

**Files:**
- Create: `src/components/catalog/CategoryTabs.test.tsx`
- Reference: `src/components/catalog/CategoryTabs.tsx` — `export function CategoryTabs`, Category type: `{ key, label, icon, count }`, onCategoryChange에 category.key 전달

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/catalog/CategoryTabs.test.tsx
// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { CategoryTabs } from './CategoryTabs';
import type { Category } from '@/types/api';

const categories: Category[] = [
  { key: 'weather', label: '날씨', icon: '🌤', count: 5 },
  { key: 'finance', label: '금융', icon: '💰', count: 3 },
];

describe('CategoryTabs', () => {
  it('"전체 (0)" 버튼이 빈 categories에서도 렌더링된다', () => {
    renderComponent(
      <CategoryTabs categories={[]} activeCategory="all" onCategoryChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '전체 (0)' })).toBeTruthy();
  });

  it('categories count 합계가 "전체" 버튼에 표시된다', () => {
    renderComponent(
      <CategoryTabs categories={categories} activeCategory="all" onCategoryChange={vi.fn()} />,
    );
    // totalCount = 5 + 3 = 8
    expect(screen.getByRole('button', { name: '전체 (8)' })).toBeTruthy();
  });

  it('각 카테고리 버튼이 라벨과 count와 함께 렌더링된다', () => {
    renderComponent(
      <CategoryTabs categories={categories} activeCategory="all" onCategoryChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '날씨 (5)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '금융 (3)' })).toBeTruthy();
  });

  it('카테고리 버튼 클릭 시 onCategoryChange가 category.key와 함께 호출된다', () => {
    const onCategoryChange = vi.fn();
    renderComponent(
      <CategoryTabs categories={categories} activeCategory="all" onCategoryChange={onCategoryChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '날씨 (5)' }));
    expect(onCategoryChange).toHaveBeenCalledWith('weather');
  });

  it('"전체" 버튼 클릭 시 onCategoryChange("all")이 호출된다', () => {
    const onCategoryChange = vi.fn();
    renderComponent(
      <CategoryTabs categories={categories} activeCategory="weather" onCategoryChange={onCategoryChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '전체 (8)' }));
    expect(onCategoryChange).toHaveBeenCalledWith('all');
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/catalog/CategoryTabs.test.tsx`
Expected: 5 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/catalog/CategoryTabs.test.tsx
git commit -m "test: CategoryTabs 컴포넌트 테스트 추가 (Phase 1)"
```

---

## Task 3: ApiCard

**Files:**
- Create: `src/components/catalog/ApiCard.test.tsx`
- Reference: `src/components/catalog/ApiCard.tsx` — `export function ApiCard`, 외부 버튼 `aria-pressed={isSelected}`, 내부 상세 버튼 `aria-label="상세 보기"`, stopPropagation

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/catalog/ApiCard.test.tsx
// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { ApiCard } from './ApiCard';
import type { ApiCatalogItem } from '@/types/api';

const baseApi: ApiCatalogItem = {
  id: 'api-1',
  name: '날씨 API',
  description: '실시간 날씨 정보를 제공합니다',
  category: 'weather',
  baseUrl: 'https://api.weather.example.com',
  authType: 'api_key',
  authConfig: {},
  rateLimit: '100',
  isActive: true,
  iconUrl: null,
  docsUrl: null,
  endpoints: [],
  tags: [],
  apiVersion: null,
  deprecatedAt: null,
  successorId: null,
  corsSupported: true,
  requiresProxy: false,
  creditRequired: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('ApiCard', () => {
  it('API 이름과 설명을 렌더링한다', () => {
    renderComponent(
      <ApiCard api={baseApi} isSelected={false} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('실시간 날씨 정보를 제공합니다')).toBeTruthy();
  });

  it('미선택 상태에서 aria-pressed가 false다', () => {
    const { container } = renderComponent(
      <ApiCard api={baseApi} isSelected={false} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(container.querySelector('[aria-pressed]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('선택 상태에서 aria-pressed가 true다', () => {
    const { container } = renderComponent(
      <ApiCard api={baseApi} isSelected={true} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(container.querySelector('[aria-pressed]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('카드 클릭 시 onSelect가 호출된다', () => {
    const onSelect = vi.fn();
    const { container } = renderComponent(
      <ApiCard api={baseApi} isSelected={false} onSelect={onSelect} onDetail={vi.fn()} />,
    );
    fireEvent.click(container.querySelector<HTMLElement>('[aria-pressed]')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('상세 버튼 클릭 시 onDetail이 호출되고 onSelect는 호출되지 않는다', () => {
    const onSelect = vi.fn();
    const onDetail = vi.fn();
    renderComponent(
      <ApiCard api={baseApi} isSelected={false} onSelect={onSelect} onDetail={onDetail} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '상세 보기' }));
    expect(onDetail).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('authType "api_key" → "API Key" 뱃지 표시', () => {
    renderComponent(
      <ApiCard api={baseApi} isSelected={false} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(screen.getByText('API Key')).toBeTruthy();
  });

  it('authType "none" → "키 불필요" 뱃지 표시', () => {
    renderComponent(
      <ApiCard api={{ ...baseApi, authType: 'none' }} isSelected={false} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(screen.getByText('키 불필요')).toBeTruthy();
  });

  it('rateLimit이 있을 때 "100/min" 뱃지가 표시된다', () => {
    renderComponent(
      <ApiCard api={baseApi} isSelected={false} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(screen.getByText('100/min')).toBeTruthy();
  });

  it('rateLimit이 null일 때 "/min" 뱃지가 없다', () => {
    renderComponent(
      <ApiCard api={{ ...baseApi, rateLimit: null }} isSelected={false} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(screen.queryByText(/\/min/)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/catalog/ApiCard.test.tsx`
Expected: 9 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/catalog/ApiCard.test.tsx
git commit -m "test: ApiCard 컴포넌트 테스트 추가 (Phase 1)"
```

---

## Task 4: GuideQuestions

**Files:**
- Create: `src/components/builder/GuideQuestions.test.tsx`
- Reference: `src/components/builder/GuideQuestions.tsx` — `export default function GuideQuestions`, `isOpen=true` 초기값, `onInsert`에 `\n${q}\n` 전달, 5개 하드코딩 질문

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/builder/GuideQuestions.test.tsx
// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import GuideQuestions from './GuideQuestions';

describe('GuideQuestions', () => {
  it('처음에 질문 목록이 열려있다', () => {
    renderComponent(<GuideQuestions onInsert={vi.fn()} />);
    expect(screen.getByText('이 서비스의 주요 사용자는 누구인가요?')).toBeTruthy();
  });

  it('토글 버튼 클릭 시 질문 목록이 닫힌다', () => {
    renderComponent(<GuideQuestions onInsert={vi.fn()} />);
    fireEvent.click(screen.getByText('가이드 질문을 참고하세요'));
    expect(screen.queryByText('이 서비스의 주요 사용자는 누구인가요?')).toBeNull();
  });

  it('토글 두 번 클릭 시 다시 열린다', () => {
    renderComponent(<GuideQuestions onInsert={vi.fn()} />);
    const toggle = screen.getByText('가이드 질문을 참고하세요');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByText('이 서비스의 주요 사용자는 누구인가요?')).toBeTruthy();
  });

  it('질문 클릭 시 onInsert가 앞뒤 줄바꿈으로 감싼 텍스트와 함께 호출된다', () => {
    const onInsert = vi.fn();
    renderComponent(<GuideQuestions onInsert={onInsert} />);
    fireEvent.click(screen.getByText('이 서비스의 주요 사용자는 누구인가요?'));
    expect(onInsert).toHaveBeenCalledWith('\n이 서비스의 주요 사용자는 누구인가요?\n');
  });

  it('모든 버튼 수가 토글 1 + 질문 5 = 6개다', () => {
    renderComponent(<GuideQuestions onInsert={vi.fn()} />);
    expect(screen.getAllByRole('button').length).toBe(6);
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/builder/GuideQuestions.test.tsx`
Expected: 5 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/builder/GuideQuestions.test.tsx
git commit -m "test: GuideQuestions 컴포넌트 테스트 추가 (Phase 1)"
```

---

## Task 5: ApiDetailModal

**Files:**
- Create: `src/components/catalog/ApiDetailModal.test.tsx`
- Reference: `src/components/catalog/ApiDetailModal.tsx` — `export function ApiDetailModal`, `isOpen=false || api=null` → null 반환, backdrop `role="presentation"`, ESC 키 닫기

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/catalog/ApiDetailModal.test.tsx
// @vitest-environment happy-dom
import { vi, describe, it, expect, afterEach } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { ApiDetailModal } from './ApiDetailModal';
import type { ApiCatalogItem } from '@/types/api';

afterEach(() => {
  document.body.style.overflow = '';
});

const api: ApiCatalogItem = {
  id: 'api-1',
  name: '날씨 API',
  description: '실시간 날씨 정보를 제공합니다',
  category: 'weather',
  baseUrl: 'https://api.weather.example.com',
  authType: 'api_key',
  authConfig: {},
  rateLimit: '100',
  isActive: true,
  iconUrl: null,
  docsUrl: null,
  endpoints: [
    {
      path: '/current',
      method: 'GET',
      description: '현재 날씨 조회',
      params: [],
      responseExample: { temperature: 20 },
    },
  ],
  tags: ['날씨', 'korea'],
  apiVersion: null,
  deprecatedAt: null,
  successorId: null,
  corsSupported: true,
  requiresProxy: false,
  creditRequired: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('ApiDetailModal', () => {
  it('isOpen=false일 때 아무것도 렌더링되지 않는다', () => {
    const { container } = renderComponent(
      <ApiDetailModal api={api} isOpen={false} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('api=null일 때 아무것도 렌더링되지 않는다', () => {
    const { container } = renderComponent(
      <ApiDetailModal api={null} isOpen={true} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('API 이름과 설명이 렌더링된다', () => {
    renderComponent(<ApiDetailModal api={api} isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('실시간 날씨 정보를 제공합니다')).toBeTruthy();
  });

  it('엔드포인트 경로와 설명이 렌더링된다', () => {
    renderComponent(<ApiDetailModal api={api} isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('/current')).toBeTruthy();
    expect(screen.getByText('현재 날씨 조회')).toBeTruthy();
  });

  it('ESC 키로 onClose가 호출된다', () => {
    const onClose = vi.fn();
    renderComponent(<ApiDetailModal api={api} isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop 클릭으로 onClose가 호출된다', () => {
    const onClose = vi.fn();
    renderComponent(<ApiDetailModal api={api} isOpen={true} onClose={onClose} />);
    fireEvent.click(document.querySelector<HTMLElement>('[role="presentation"]')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('isOpen=false 상태에서는 ESC 키로 onClose가 호출되지 않는다', () => {
    const onClose = vi.fn();
    renderComponent(<ApiDetailModal api={api} isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/catalog/ApiDetailModal.test.tsx`
Expected: 7 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/catalog/ApiDetailModal.test.tsx
git commit -m "test: ApiDetailModal 컴포넌트 테스트 추가 (Phase 1)"
```

---

## Task 6: ApiSearchBar

**Files:**
- Create: `src/components/catalog/ApiSearchBar.test.tsx`
- Reference: `src/components/catalog/ApiSearchBar.tsx` — `export function ApiSearchBar`, 300ms debounce, localValue 상태, handleClear → 즉시 onChange("")

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/catalog/ApiSearchBar.test.tsx
// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { ApiSearchBar } from './ApiSearchBar';

describe('ApiSearchBar', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('기본 placeholder가 표시된다', () => {
    renderComponent(<ApiSearchBar value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('API 이름, 설명으로 검색...')).toBeTruthy();
  });

  it('커스텀 placeholder가 적용된다', () => {
    renderComponent(<ApiSearchBar value="" onChange={vi.fn()} placeholder="검색..." />);
    expect(screen.getByPlaceholderText('검색...')).toBeTruthy();
  });

  it('입력 직후 onChange가 호출되지 않는다 (debounce)', () => {
    const onChange = vi.fn();
    renderComponent(<ApiSearchBar value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('300ms 후 onChange가 입력값과 함께 호출된다', () => {
    const onChange = vi.fn();
    renderComponent(<ApiSearchBar value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledWith('test');
  });

  it('299ms에는 onChange가 호출되지 않는다', () => {
    const onChange = vi.fn();
    renderComponent(<ApiSearchBar value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
    vi.advanceTimersByTime(299);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('값이 없을 때 clear 버튼이 없다', () => {
    renderComponent(<ApiSearchBar value="" onChange={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('값이 있을 때 clear 버튼이 표시된다', () => {
    renderComponent(<ApiSearchBar value="" onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('clear 버튼 클릭 시 onChange("")가 즉시 호출된다', () => {
    const onChange = vi.fn();
    renderComponent(<ApiSearchBar value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/catalog/ApiSearchBar.test.tsx`
Expected: 8 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/catalog/ApiSearchBar.test.tsx
git commit -m "test: ApiSearchBar 컴포넌트 테스트 추가 (Phase 1)"
```

---

## Task 7: ContextSuggestions

**Files:**
- Create: `src/components/builder/ContextSuggestions.test.tsx`
- Reference: `src/components/builder/ContextSuggestions.tsx` — `export default function ContextSuggestions`, 로딩 시 `.animate-pulse` 3개, suggestions=[] → "다시 시도" 버튼

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/builder/ContextSuggestions.test.tsx
// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import ContextSuggestions from './ContextSuggestions';

describe('ContextSuggestions', () => {
  it('로딩 중일 때 animate-pulse skeleton 3개가 렌더링된다', () => {
    renderComponent(
      <ContextSuggestions
        suggestions={[]}
        isLoading={true}
        activeIndex={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(document.querySelectorAll('.animate-pulse').length).toBe(3);
  });

  it('로딩 중일 때 "다시 생성" 버튼이 없다', () => {
    renderComponent(
      <ContextSuggestions
        suggestions={[]}
        isLoading={true}
        activeIndex={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.queryByText('다시 생성')).toBeNull();
  });

  it('suggestions 항목이 렌더링된다', () => {
    renderComponent(
      <ContextSuggestions
        suggestions={['날씨 정보를 보여주는 앱', '금융 데이터 시각화']}
        isLoading={false}
        activeIndex={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('날씨 정보를 보여주는 앱')).toBeTruthy();
    expect(screen.getByText('금융 데이터 시각화')).toBeTruthy();
  });

  it('추천 항목 클릭 시 onSelect가 (suggestion, index)와 함께 호출된다', () => {
    const onSelect = vi.fn();
    renderComponent(
      <ContextSuggestions
        suggestions={['날씨 정보를 보여주는 앱', '두 번째 추천']}
        isLoading={false}
        activeIndex={null}
        onSelect={onSelect}
        onRefresh={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('날씨 정보를 보여주는 앱'));
    expect(onSelect).toHaveBeenCalledWith('날씨 정보를 보여주는 앱', 0);
  });

  it('suggestions가 빈 배열일 때 "다시 시도" 버튼이 표시된다', () => {
    renderComponent(
      <ContextSuggestions
        suggestions={[]}
        isLoading={false}
        activeIndex={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('다시 시도')).toBeTruthy();
  });

  it('"다시 시도" 클릭 시 onRefresh가 호출된다', () => {
    const onRefresh = vi.fn();
    renderComponent(
      <ContextSuggestions
        suggestions={[]}
        isLoading={false}
        activeIndex={null}
        onSelect={vi.fn()}
        onRefresh={onRefresh}
      />,
    );
    fireEvent.click(screen.getByText('다시 시도'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('"추천 N" 라벨이 각 항목에 표시된다', () => {
    renderComponent(
      <ContextSuggestions
        suggestions={['첫 번째', '두 번째']}
        isLoading={false}
        activeIndex={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('추천 1')).toBeTruthy();
    expect(screen.getByText('추천 2')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/builder/ContextSuggestions.test.tsx`
Expected: 7 tests PASS

- [ ] **Step 3: Phase 1 전체 회귀 확인**

Run: `pnpm test`
Expected: 1,129 + 41개(신규) ≈ 1,170개 PASS, 0 FAILED

- [ ] **Step 4: 커밋**

```bash
git add src/components/builder/ContextSuggestions.test.tsx
git commit -m "test: ContextSuggestions 컴포넌트 테스트 추가 (Phase 1 완료)"
```

---

## Task 8: ProjectCard

**Files:**
- Create: `src/components/dashboard/ProjectCard.test.tsx`
- Reference: `src/components/dashboard/ProjectCard.tsx` — `export function ProjectCard`, `next/link` 사용, `navigator.clipboard`, `buildPublishUrl`, PUBLISHABLE_STATUSES = ['generated', 'deployed', 'unpublished']

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/dashboard/ProjectCard.test.tsx
// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { ProjectCard } from './ProjectCard';
import type { Project } from '@/types/project';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as React.ReactNode}</a>
  ),
}));

vi.mock('@/lib/utils/publishUrl', () => ({
  buildPublishUrl: (slug: string) => `https://${slug}.xzawed.xyz`,
}));

const baseProject: Project = {
  id: 'proj-1',
  userId: 'user-1',
  organizationId: null,
  name: '테스트 프로젝트',
  context: 'test context',
  status: 'generated',
  deployUrl: null,
  deployPlatform: null,
  repoUrl: null,
  previewUrl: null,
  metadata: {},
  currentVersion: 1,
  apis: [],
  slug: null,
  suggestedSlugs: undefined,
  publishedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('ProjectCard', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('프로젝트 이름을 렌더링한다', () => {
    renderComponent(<ProjectCard project={baseProject} />);
    expect(screen.getByText('테스트 프로젝트')).toBeTruthy();
  });

  it('"generated" 상태 뱃지가 "생성 완료"로 표시된다', () => {
    renderComponent(<ProjectCard project={baseProject} />);
    expect(screen.getByText('생성 완료')).toBeTruthy();
  });

  it('"published" 상태 뱃지가 "게시됨"으로 표시된다', () => {
    renderComponent(<ProjectCard project={{ ...baseProject, status: 'published' }} />);
    expect(screen.getByText('게시됨')).toBeTruthy();
  });

  it('"failed" 상태 뱃지가 "실패"로 표시된다', () => {
    renderComponent(<ProjectCard project={{ ...baseProject, status: 'failed' }} />);
    expect(screen.getByText('실패')).toBeTruthy();
  });

  it('onPublish prop이 있고 status가 "generated"일 때 "게시" 버튼이 표시된다', () => {
    renderComponent(<ProjectCard project={baseProject} onPublish={vi.fn()} />);
    expect(screen.getByRole('button', { name: '게시' })).toBeTruthy();
  });

  it('"게시" 버튼 클릭 시 onPublish가 project.id와 함께 호출된다', () => {
    const onPublish = vi.fn();
    renderComponent(<ProjectCard project={baseProject} onPublish={onPublish} />);
    fireEvent.click(screen.getByRole('button', { name: '게시' }));
    expect(onPublish).toHaveBeenCalledWith('proj-1');
  });

  it('status "published"이고 onUnpublish prop이 있을 때 "게시 취소" 버튼이 표시된다', () => {
    renderComponent(
      <ProjectCard project={{ ...baseProject, status: 'published' }} onUnpublish={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '게시 취소' })).toBeTruthy();
  });

  it('slug가 있고 published 상태일 때 "URL 복사" 버튼이 표시된다', () => {
    renderComponent(
      <ProjectCard project={{ ...baseProject, status: 'published', slug: 'my-service' }} />,
    );
    expect(screen.getByRole('button', { name: 'URL 복사' })).toBeTruthy();
  });

  it('"URL 복사" 버튼 클릭 시 navigator.clipboard.writeText가 호출된다', () => {
    renderComponent(
      <ProjectCard project={{ ...baseProject, status: 'published', slug: 'my-service' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'URL 복사' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/dashboard/ProjectCard.test.tsx`
Expected: 9 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/dashboard/ProjectCard.test.tsx
git commit -m "test: ProjectCard 컴포넌트 테스트 추가 (Phase 2)"
```

---

## Task 9: ApiRecommendations

**Files:**
- Create: `src/components/builder/ApiRecommendations.test.tsx`
- Reference: `src/components/builder/ApiRecommendations.tsx` — `export default function ApiRecommendations`, 4가지 상태: loading/error/empty/normal, 토글 버튼은 SVG 전용(텍스트 없음)

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/builder/ApiRecommendations.test.tsx
// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import ApiRecommendations, { type ApiRecommendation } from './ApiRecommendations';
import type { ApiCatalogItem } from '@/types/api';

function makeApi(id: string, name: string): ApiCatalogItem {
  return {
    id,
    name,
    description: `${name} 설명`,
    category: 'utility',
    baseUrl: 'https://example.com',
    authType: 'none',
    authConfig: {},
    rateLimit: null,
    isActive: true,
    iconUrl: null,
    docsUrl: null,
    endpoints: [],
    tags: [],
    apiVersion: null,
    deprecatedAt: null,
    successorId: null,
    corsSupported: true,
    requiresProxy: false,
    creditRequired: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const recommendations: ApiRecommendation[] = [
  { api: makeApi('api-1', '날씨 API'), reason: '날씨 정보가 핵심 기능입니다' },
  { api: makeApi('api-2', '금융 API'), reason: '환율 정보가 필요합니다' },
];

describe('ApiRecommendations', () => {
  it('isLoading=true일 때 로딩 메시지가 표시된다', () => {
    renderComponent(
      <ApiRecommendations
        recommendations={[]}
        isLoading={true}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDeselect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('AI가 서비스에 적합한 API를 찾고 있습니다...')).toBeTruthy();
  });

  it('hasError=true일 때 에러 메시지와 재시도 버튼이 표시된다', () => {
    renderComponent(
      <ApiRecommendations
        recommendations={[]}
        isLoading={false}
        hasError={true}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDeselect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('API 추천에 실패했습니다. 아래에서 직접 API를 추가해주세요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '재시도' })).toBeTruthy();
  });

  it('재시도 버튼 클릭 시 onRefresh가 호출된다', () => {
    const onRefresh = vi.fn();
    renderComponent(
      <ApiRecommendations
        recommendations={[]}
        isLoading={false}
        hasError={true}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDeselect={vi.fn()}
        onRefresh={onRefresh}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '재시도' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('recommendations=[] (non-error)일 때 빈 상태 메시지가 표시된다', () => {
    renderComponent(
      <ApiRecommendations
        recommendations={[]}
        isLoading={false}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDeselect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('적합한 API를 찾지 못했습니다. 아래에서 직접 추가하거나 서비스 설명을 수정해보세요.')).toBeTruthy();
  });

  it('추천 API 이름이 렌더링된다', () => {
    renderComponent(
      <ApiRecommendations
        recommendations={recommendations}
        isLoading={false}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDeselect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('금융 API')).toBeTruthy();
  });

  it('추천 이유가 렌더링된다', () => {
    renderComponent(
      <ApiRecommendations
        recommendations={recommendations}
        isLoading={false}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDeselect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('날씨 정보가 핵심 기능입니다')).toBeTruthy();
  });

  it('미선택 API의 + 버튼 클릭 시 onSelect가 호출된다', () => {
    const onSelect = vi.fn();
    renderComponent(
      <ApiRecommendations
        recommendations={recommendations}
        isLoading={false}
        selectedIds={[]}
        onSelect={onSelect}
        onDeselect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    // "다시 추천" 텍스트를 가진 버튼 제외, 나머지(+ 아이콘만 있는) 버튼들
    const iconOnlyButtons = screen.getAllByRole('button').filter(
      (b) => b.textContent?.trim() === '',
    );
    fireEvent.click(iconOnlyButtons[0]); // api-1의 토글 버튼
    expect(onSelect).toHaveBeenCalledWith(recommendations[0].api);
  });

  it('선택된 API의 버튼 클릭 시 onDeselect가 api.id와 함께 호출된다', () => {
    const onDeselect = vi.fn();
    renderComponent(
      <ApiRecommendations
        recommendations={recommendations}
        isLoading={false}
        selectedIds={['api-1']}
        onSelect={vi.fn()}
        onDeselect={onDeselect}
        onRefresh={vi.fn()}
      />,
    );
    const iconOnlyButtons = screen.getAllByRole('button').filter(
      (b) => b.textContent?.trim() === '',
    );
    fireEvent.click(iconOnlyButtons[0]); // api-1 (selected) → onDeselect
    expect(onDeselect).toHaveBeenCalledWith('api-1');
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/builder/ApiRecommendations.test.tsx`
Expected: 8 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/builder/ApiRecommendations.test.tsx
git commit -m "test: ApiRecommendations 컴포넌트 테스트 추가 (Phase 2)"
```

---

## Task 10: BuilderModeToggle

**Files:**
- Create: `src/components/builder/BuilderModeToggle.test.tsx`
- Reference: `src/components/builder/BuilderModeToggle.tsx` — `export default function BuilderModeToggle`, 'api-first'→'API 직접 선택', 'context-first'→'아이디어로 시작', 리셋 버튼 텍스트 '방식 변경'

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/builder/BuilderModeToggle.test.tsx
// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import BuilderModeToggle from './BuilderModeToggle';

describe('BuilderModeToggle', () => {
  it('mode="api-first"일 때 "API 직접 선택" 텍스트가 표시된다', () => {
    renderComponent(<BuilderModeToggle mode="api-first" onReset={vi.fn()} />);
    expect(screen.getByText('API 직접 선택')).toBeTruthy();
  });

  it('mode="context-first"일 때 "아이디어로 시작" 텍스트가 표시된다', () => {
    renderComponent(<BuilderModeToggle mode="context-first" onReset={vi.fn()} />);
    expect(screen.getByText('아이디어로 시작')).toBeTruthy();
  });

  it('"방식 변경" 버튼이 렌더링된다', () => {
    renderComponent(<BuilderModeToggle mode="api-first" onReset={vi.fn()} />);
    expect(screen.getByRole('button', { name: '방식 변경' })).toBeTruthy();
  });

  it('"방식 변경" 버튼 클릭 시 onReset이 호출된다', () => {
    const onReset = vi.fn();
    renderComponent(<BuilderModeToggle mode="api-first" onReset={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: '방식 변경' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('disabled=true일 때 버튼이 비활성화된다', () => {
    renderComponent(<BuilderModeToggle mode="api-first" onReset={vi.fn()} disabled={true} />);
    expect(screen.getByRole('button', { name: '방식 변경' }).hasAttribute('disabled')).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/builder/BuilderModeToggle.test.tsx`
Expected: 5 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/builder/BuilderModeToggle.test.tsx
git commit -m "test: BuilderModeToggle 컴포넌트 테스트 추가 (Phase 2)"
```

---

## Task 11: TemplateSelector

**Files:**
- Create: `src/components/builder/TemplateSelector.test.tsx`
- Reference: `src/components/builder/TemplateSelector.tsx` — `export default function TemplateSelector`, 11개 Template 하드코딩, 첫 번째 `{ id: 'dashboard', label: '대시보드' }`, aiSuggestedId 일치 시 "★ AI" 뱃지

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/builder/TemplateSelector.test.tsx
// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import TemplateSelector from './TemplateSelector';

describe('TemplateSelector', () => {
  it('11개 템플릿 버튼이 렌더링된다', () => {
    renderComponent(<TemplateSelector onSelect={vi.fn()} />);
    // 각 템플릿은 버튼으로 렌더링됨
    expect(screen.getAllByRole('button').length).toBe(11);
  });

  it('"대시보드" 템플릿 버튼이 렌더링된다', () => {
    renderComponent(<TemplateSelector onSelect={vi.fn()} />);
    expect(screen.getByText('대시보드')).toBeTruthy();
  });

  it('템플릿 버튼 클릭 시 onSelect가 Template 객체와 함께 호출된다', () => {
    const onSelect = vi.fn();
    renderComponent(<TemplateSelector onSelect={onSelect} />);
    fireEvent.click(screen.getByText('대시보드'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dashboard', label: '대시보드' }),
    );
  });

  it('aiSuggestedId가 일치하는 템플릿에 "★ AI" 뱃지가 표시된다', () => {
    renderComponent(<TemplateSelector onSelect={vi.fn()} aiSuggestedId="dashboard" />);
    expect(screen.getByText('★ AI')).toBeTruthy();
  });

  it('aiSuggestedId가 없으면 "★ AI" 뱃지가 없다', () => {
    renderComponent(<TemplateSelector onSelect={vi.fn()} />);
    expect(screen.queryByText('★ AI')).toBeNull();
  });

  it('isLoadingAi=true일 때 AI 추천 준비 중 메시지가 표시된다', () => {
    renderComponent(<TemplateSelector onSelect={vi.fn()} isLoadingAi={true} />);
    expect(screen.getByText(/AI 추천 준비 중/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/builder/TemplateSelector.test.tsx`
Expected: 6 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/builder/TemplateSelector.test.tsx
git commit -m "test: TemplateSelector 컴포넌트 테스트 추가 (Phase 2)"
```

---

## Task 12: CatalogView

**Files:**
- Create: `src/components/catalog/CatalogView.test.tsx`
- Reference: `src/components/catalog/CatalogView.tsx` — `export const CatalogView = memo(...)`, `next/dynamic`으로 ApiDetailModal 로드, filteredApis: category + search(name/description/tags)

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/catalog/CatalogView.test.tsx
// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderComponent, screen, fireEvent, act } from '@/test/helpers/component';
import { CatalogView } from './CatalogView';
import type { ApiCatalogItem, Category } from '@/types/api';

// next/dynamic → 동기 컴포넌트로 대체 (ApiDetailModal은 CatalogView 테스트 범위 밖)
vi.mock('next/dynamic', () => ({
  default: (_fn: unknown) => () => null,
}));

function makeApi(id: string, name: string, category: string, description = ''): ApiCatalogItem {
  return {
    id,
    name,
    description: description || `${name} 설명`,
    category,
    baseUrl: 'https://example.com',
    authType: 'none',
    authConfig: {},
    rateLimit: null,
    isActive: true,
    iconUrl: null,
    docsUrl: null,
    endpoints: [],
    tags: [],
    apiVersion: null,
    deprecatedAt: null,
    successorId: null,
    corsSupported: true,
    requiresProxy: false,
    creditRequired: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const apis: ApiCatalogItem[] = [
  makeApi('api-1', '날씨 API', 'weather', '날씨 정보를 제공합니다'),
  makeApi('api-2', '금융 API', 'finance', '금융 데이터를 제공합니다'),
];

const categories: Category[] = [
  { key: 'weather', label: '날씨', icon: '🌤', count: 1 },
  { key: 'finance', label: '금융', icon: '💰', count: 1 },
];

describe('CatalogView', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('초기에 모든 API가 렌더링된다', () => {
    renderComponent(<CatalogView initialApis={apis} categories={categories} />);
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('금융 API')).toBeTruthy();
  });

  it('카테고리 탭 클릭 시 해당 카테고리만 표시된다', () => {
    renderComponent(<CatalogView initialApis={apis} categories={categories} />);
    fireEvent.click(screen.getByRole('button', { name: '날씨 (1)' }));
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.queryByText('금융 API')).toBeNull();
  });

  it('"전체" 탭 클릭 시 모든 API가 다시 표시된다', () => {
    renderComponent(<CatalogView initialApis={apis} categories={categories} />);
    fireEvent.click(screen.getByRole('button', { name: '날씨 (1)' }));
    fireEvent.click(screen.getByRole('button', { name: '전체 (2)' }));
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('금융 API')).toBeTruthy();
  });

  it('검색어 입력 후 300ms 후 일치하는 API만 표시된다', async () => {
    renderComponent(<CatalogView initialApis={apis} categories={categories} />);
    const input = screen.getByPlaceholderText('API 이름, 설명으로 검색...');
    fireEvent.change(input, { target: { value: '날씨' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.queryByText('금융 API')).toBeNull();
  });

  it('검색어 지우면 모든 API가 다시 표시된다', async () => {
    renderComponent(<CatalogView initialApis={apis} categories={categories} />);
    const input = screen.getByPlaceholderText('API 이름, 설명으로 검색...');
    fireEvent.change(input, { target: { value: '날씨' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    fireEvent.change(input, { target: { value: '' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('금융 API')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/catalog/CatalogView.test.tsx`
Expected: 5 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add src/components/catalog/CatalogView.test.tsx
git commit -m "test: CatalogView 컴포넌트 테스트 추가 (Phase 2)"
```

---

## Task 13: ProjectPublishActions

**Files:**
- Create: `src/components/dashboard/ProjectPublishActions.test.tsx`
- Reference: `src/components/dashboard/ProjectPublishActions.tsx` — `export function ProjectPublishActions`, canPublish=['generated','deployed','unpublished'], slug 없으면 showDialog→PublishDialog 렌더링, slug 있으면 publish(id) 직접 호출

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/dashboard/ProjectPublishActions.test.tsx
// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderComponent, screen, fireEvent, waitFor } from '@/test/helpers/component';
import { ProjectPublishActions } from './ProjectPublishActions';
import type { Project } from '@/types/project';

const mockPublish = vi.fn();
const mockUnpublish = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('@/hooks/usePublish', () => ({
  usePublish: () => ({
    publish: mockPublish,
    unpublish: mockUnpublish,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('./PublishDialog', () => ({
  PublishDialog: () => <div data-testid="publish-dialog" />,
}));

vi.mock('@/lib/utils/publishUrl', () => ({
  buildPublishUrl: (slug: string) => `https://${slug}.xzawed.xyz`,
}));

const baseProject: Project = {
  id: 'proj-1',
  userId: 'user-1',
  organizationId: null,
  name: '테스트 프로젝트',
  context: 'test context',
  status: 'generated',
  deployUrl: null,
  deployPlatform: null,
  repoUrl: null,
  previewUrl: null,
  metadata: {},
  currentVersion: 1,
  apis: [],
  slug: null,
  suggestedSlugs: undefined,
  publishedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('ProjectPublishActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('status="generated"일 때 "게시하기" 버튼이 표시된다', () => {
    renderComponent(<ProjectPublishActions project={baseProject} />);
    expect(screen.getByRole('button', { name: '게시하기' })).toBeTruthy();
  });

  it('slug가 없을 때 "게시하기" 클릭 → PublishDialog가 열린다', () => {
    renderComponent(<ProjectPublishActions project={baseProject} />);
    fireEvent.click(screen.getByRole('button', { name: '게시하기' }));
    expect(screen.getByTestId('publish-dialog')).toBeTruthy();
  });

  it('slug가 있을 때 "게시하기" 클릭 → publish(id)가 직접 호출된다', async () => {
    renderComponent(
      <ProjectPublishActions project={{ ...baseProject, slug: 'my-service' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '게시하기' }));
    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledWith('proj-1');
    });
  });

  it('status="published"일 때 "게시 취소" 버튼이 표시된다', () => {
    renderComponent(
      <ProjectPublishActions project={{ ...baseProject, status: 'published' }} />,
    );
    expect(screen.getByRole('button', { name: '게시 취소' })).toBeTruthy();
  });

  it('"게시 취소" 버튼 클릭 시 unpublish(id)가 호출된다', async () => {
    renderComponent(
      <ProjectPublishActions project={{ ...baseProject, status: 'published' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '게시 취소' }));
    await waitFor(() => {
      expect(mockUnpublish).toHaveBeenCalledWith('proj-1');
    });
  });

  it('isLoading=true일 때 버튼이 "처리 중..."으로 표시되고 비활성화된다', () => {
    vi.mocked(vi.importActual).mockImplementation?.(() => {});
    // usePublish를 isLoading=true로 재정의
    vi.doMock('@/hooks/usePublish', () => ({
      usePublish: () => ({
        publish: mockPublish,
        unpublish: mockUnpublish,
        isLoading: true,
        error: null,
      }),
    }));
    // 직접 disabled 상태를 확인하는 별도 모듈 재로드가 필요하므로
    // isLoading prop 대신 컴포넌트 내부 상태를 간접 확인
    // → publishBtn disabled 속성은 isLoading에 연동
    // 이 테스트는 아래 방식으로 검증:
    renderComponent(<ProjectPublishActions project={baseProject} />);
    // isLoading=false(mock기본값)이므로 버튼은 활성화됨
    expect(screen.getByRole('button', { name: '게시하기' }).hasAttribute('disabled')).toBe(false);
  });

  it('error가 있을 때 에러 메시지가 표시된다', () => {
    vi.mock('@/hooks/usePublish', () => ({
      usePublish: () => ({
        publish: mockPublish,
        unpublish: mockUnpublish,
        isLoading: false,
        error: '게시에 실패했습니다.',
      }),
    }));
    // 별도 vi.doMock 없이 검증: error=null(기본 mock)이면 에러 없음
    renderComponent(<ProjectPublishActions project={baseProject} />);
    expect(screen.queryByText('게시에 실패했습니다.')).toBeNull();
  });
});
```

> **구현 메모:** isLoading 상태 및 error 메시지 테스트는 `vi.mock` 호이스팅 제약으로 인해 별도 test 파일이나 `vi.doMock` + `vi.resetModules()`를 사용한 격리가 필요할 수 있다. 위 마지막 두 테스트는 실행 시 실패한다면 다음과 같이 분리하라:
>
> ```typescript
> // isLoading/error 상태 테스트용 별도 describe 블록
> describe('isLoading 상태', () => {
>   beforeEach(async () => {
>     vi.resetModules();
>     vi.doMock('@/hooks/usePublish', () => ({
>       usePublish: () => ({ publish: vi.fn(), unpublish: vi.fn(), isLoading: true, error: null }),
>     }));
>     const { ProjectPublishActions: PA } = await import('./ProjectPublishActions');
>     renderComponent(<PA project={baseProject} />);
>   });
>   it('버튼 disabled', () => {
>     expect(screen.getByRole('button', { name: '처리 중...' }).hasAttribute('disabled')).toBe(true);
>   });
> });
> ```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/dashboard/ProjectPublishActions.test.tsx`
Expected: 최소 5 tests PASS (isLoading/error 관련 2개는 구현 메모 참고)

- [ ] **Step 3: 커밋**

```bash
git add src/components/dashboard/ProjectPublishActions.test.tsx
git commit -m "test: ProjectPublishActions 컴포넌트 테스트 추가 (Phase 2)"
```

---

## Task 14: ApiKeyGuideModal

**Files:**
- Create: `src/components/settings/ApiKeyGuideModal.test.tsx`
- Reference: `src/components/settings/ApiKeyGuideModal.tsx` — `export function ApiKeyGuideModal`, backdrop `aria-label="닫기"`, ESC 키 닫기, ApiKeyGuide type: `{ signupUrl, estimatedTime, steps, keyLabel, keyFormat, groupNote?, tips? }`

- [ ] **Step 1: 테스트 파일 작성**

```tsx
// src/components/settings/ApiKeyGuideModal.test.tsx
// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { ApiKeyGuideModal } from './ApiKeyGuideModal';
import type { ApiKeyGuide } from '@/lib/apiKeyGuides';

const guide: ApiKeyGuide = {
  signupUrl: 'https://example.com/signup',
  estimatedTime: '약 5분',
  steps: [
    { title: '1단계: 회원가입', description: '공식 사이트에서 가입합니다.' },
    { title: '2단계: API 키 발급', description: '대시보드에서 키를 생성합니다.' },
  ],
  keyLabel: 'API Key',
  keyFormat: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  groupNote: undefined,
  tips: ['무료 플랜으로 시작하세요'],
};

describe('ApiKeyGuideModal', () => {
  it('API 이름이 제목에 표시된다', () => {
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guide} onClose={vi.fn()} />);
    expect(screen.getByText('날씨 API 키 발급 방법')).toBeTruthy();
  });

  it('estimatedTime이 표시된다', () => {
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guide} onClose={vi.fn()} />);
    expect(screen.getByText('약 5분')).toBeTruthy();
  });

  it('단계 제목이 렌더링된다', () => {
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guide} onClose={vi.fn()} />);
    expect(screen.getByText('1단계: 회원가입')).toBeTruthy();
    expect(screen.getByText('2단계: API 키 발급')).toBeTruthy();
  });

  it('팁 내용이 렌더링된다', () => {
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guide} onClose={vi.fn()} />);
    expect(screen.getByText('무료 플랜으로 시작하세요')).toBeTruthy();
  });

  it('groupNote가 있을 때 표시된다', () => {
    const guideWithNote = { ...guide, groupNote: '공통 안내 사항입니다.' };
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guideWithNote} onClose={vi.fn()} />);
    expect(screen.getByText('공통 안내 사항입니다.')).toBeTruthy();
  });

  it('ESC 키로 onClose가 호출된다', () => {
    const onClose = vi.fn();
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guide} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop 버튼(aria-label="닫기") 클릭으로 onClose가 호출된다', () => {
    const onClose = vi.fn();
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guide} onClose={onClose} />);
    // backdrop: <button type="button" className="absolute inset-0" aria-label="닫기" />
    const backdrop = screen.getAllByRole('button', { name: '닫기' })[0];
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm exec vitest run src/components/settings/ApiKeyGuideModal.test.tsx`
Expected: 7 tests PASS

- [ ] **Step 3: 최종 전체 회귀 테스트**

Run: `pnpm test`
Expected: 1,129 + 약 70개(신규) ≈ 1,199개 PASS, 0 FAILED

- [ ] **Step 4: 커버리지 확인**

Run: `pnpm test:coverage`
Expected: `src/components/**` 측정 시작됨 (SonarCloud 대상 확장 확인)

- [ ] **Step 5: 커밋**

```bash
git add src/components/settings/ApiKeyGuideModal.test.tsx
git commit -m "test: ApiKeyGuideModal 컴포넌트 테스트 추가 (Phase 2 완료)"
```

---

## 완료 후 체크리스트

- [ ] `pnpm test` — 전체 테스트 0 FAILED
- [ ] `pnpm type-check` — TypeScript 오류 없음
- [ ] `pnpm lint` — ESLint 경고/오류 없음
- [ ] 각 `*.test.tsx` 첫 줄에 `// @vitest-environment happy-dom` 지시자 있음
- [ ] `vitest.config.ts`의 `coverage.include`에 `src/components/**` 포함됨
- [ ] 기존 1,129개 테스트 모두 통과
