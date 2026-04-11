# 웹페이지 생성 품질 극대화 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 코드 생성 파이프라인 전반을 개선하여, 사용자 입력 컨텍스트 이후 생성되는 웹페이지의 디자인 품질, 접근성, 성능, 사용자 경험을 최고 수준으로 끌어올린다.

**Architecture:** 3단계 접근 — (1) 사용자 컨텍스트 입력을 구조화된 선호도 필드로 확장, (2) API 카테고리 기반 동적 프롬프트 분기로 서비스 유형별 최적 가이드 제공, (3) 생성 후 품질 스코어링 + 자동 재생성 루프로 최소 품질 보장. 모든 변경은 기존 파이프라인에 하위 호환되게 추가한다.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Zustand, Zod, Tailwind CSS 4, Claude API (Anthropic SDK)

**이미 완료된 작업 (Phase 1-4):**
- Phase 1: 시스템 프롬프트 강화 (a11y, 타이포, 푸터, 마이크로인터랙션, 조건부 CDN, 로딩/에러 상태)
- Phase 2: `evaluateQuality()` 품질 스코어링 함수 + generate/regenerate route 통합
- Phase 3: `assembleHtml()` 후처리 보강 (OG 메타태그, 파비콘, lazy loading, CSS 변수, 프린트 스타일시트)
- Phase 4: 테마 3→8개 확장, 히어로 섹션 3변형, 카드 3변형

---

## File Structure

### 수정할 파일

| 파일 | 역할 | 변경 내용 |
|---|---|---|
| `src/stores/contextStore.ts` | 빌더 컨텍스트 상태 관리 | 디자인 선호도 필드 추가 (mood, audience, layoutPreference) |
| `src/components/builder/DesignPreferences.tsx` | **신규** — 디자인 선호도 입력 UI | 칩 버튼 기반 분위기/대상/레이아웃 선택 |
| `src/app/(main)/builder/page.tsx` | 빌더 페이지 | DesignPreferences 컴포넌트 통합 |
| `src/types/project.ts` | 프로젝트 타입 정의 | `DesignPreferences` 타입 + `CreateProjectInput` 확장 |
| `src/app/api/v1/projects/route.ts` | 프로젝트 생성 API | 스키마에 `designPreferences` 추가 |
| `src/services/projectService.ts` | 프로젝트 서비스 | `create()`에서 선호도를 `metadata`에 저장 |
| `src/lib/ai/promptBuilder.ts` | 프롬프트 빌더 | `buildUserPrompt()`에 선호도 섹션 + 카테고리 기반 가이드 추가 |
| `src/lib/ai/categoryDesignMap.ts` | **신규** — 카테고리→디자인 매핑 | API 카테고리에서 추천 테마/레이아웃 추론 |
| `src/app/api/v1/generate/route.ts` | 생성 API | 카테고리 분석 + 프롬프트에 전달 + 품질 루프 |
| `src/app/api/v1/generate/regenerate/route.ts` | 재생성 API | 카테고리 분석 동일 적용 |
| `src/lib/ai/qualityLoop.ts` | **신규** — 품질 자동 재생성 | 점수 < 40 시 개선 프롬프트로 1회 재시도 |

### 테스트 파일

| 파일 | 대상 |
|---|---|
| `src/lib/ai/categoryDesignMap.test.ts` | 카테고리→디자인 매핑 로직 |
| `src/lib/ai/codeValidator.test.ts` | evaluateQuality 테스트 추가 |
| `src/lib/ai/qualityLoop.test.ts` | 품질 루프 판단 로직 |
| `src/__tests__/api/generate.test.ts` | generate route mock 업데이트 |

---

## Task 1: 디자인 선호도 타입 정의

**Files:**
- Modify: `src/types/project.ts:66-82`

- [ ] **Step 1: 타입 추가**

```typescript
// src/types/project.ts — CodeMetadata 다음, CreateProjectInput 전에 추가

export type DesignMood = 'auto' | 'light' | 'dark' | 'warm' | 'colorful' | 'minimal';
export type DesignAudience = 'general' | 'business' | 'youth' | 'premium';
export type DesignLayout = 'auto' | 'dashboard' | 'gallery' | 'feed' | 'landing' | 'tool';

export interface DesignPreferences {
  mood: DesignMood;
  audience: DesignAudience;
  layoutPreference: DesignLayout;
}
```

- [ ] **Step 2: CreateProjectInput 확장**

```typescript
// src/types/project.ts — CreateProjectInput 수정
export interface CreateProjectInput {
  name: string;
  context: string;
  apiIds: string[];
  organizationId?: string;
  designPreferences?: DesignPreferences;
}
```

- [ ] **Step 3: CodeMetadata에 품질 필드 추가**

```typescript
// src/types/project.ts — CodeMetadata 확장
export interface CodeMetadata {
  qualityScore?: number;
  securityCheckPassed?: boolean;
  hasResponsive?: boolean;
  hasDarkMode?: boolean;
  externalLibs?: string[];
  userFeedback?: string | null;
  validationErrors?: string[];
  // Phase 2에서 추가된 evaluateQuality 필드
  structuralScore?: number;
  hasSemanticHtml?: boolean;
  hasMockData?: boolean;
  hasInteraction?: boolean;
  hasResponsiveClasses?: boolean;
  hasFooter?: boolean;
  hasImgAlt?: boolean;
  details?: string[];
  // Phase 6 추가
  apiCategories?: string[];
  inferredTheme?: string;
  inferredLayout?: string;
  qualityLoopUsed?: boolean;
}
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (새 타입은 아직 참조되지 않으므로)

- [ ] **Step 5: 커밋**

```bash
git add src/types/project.ts
git commit -m "feat: 디자인 선호도 타입 및 CodeMetadata 확장 정의"
```

---

## Task 2: contextStore에 디자인 선호도 상태 추가

**Files:**
- Modify: `src/stores/contextStore.ts`

- [ ] **Step 1: 스토어 인터페이스 확장**

```typescript
// src/stores/contextStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LIMITS } from '@/lib/config/features';
import type { DesignMood, DesignAudience, DesignLayout, DesignPreferences } from '@/types/project';

interface ContextState {
  context: string;
  selectedTemplate: string | null;
  mood: DesignMood;
  audience: DesignAudience;
  layoutPreference: DesignLayout;

  setContext: (context: string) => void;
  setTemplate: (templateId: string | null) => void;
  setMood: (mood: DesignMood) => void;
  setAudience: (audience: DesignAudience) => void;
  setLayoutPreference: (layout: DesignLayout) => void;
  getDesignPreferences: () => DesignPreferences;
  isValid: () => boolean;
  charCount: () => number;
  reset: () => void;
}

export const useContextStore = create<ContextState>()(
  persist(
    (set, get) => ({
      context: '',
      selectedTemplate: null,
      mood: 'auto' as DesignMood,
      audience: 'general' as DesignAudience,
      layoutPreference: 'auto' as DesignLayout,

      setContext: (context) => {
        if (context.length <= LIMITS.contextMaxLength) {
          set({ context });
        }
      },

      setTemplate: (selectedTemplate) => set({ selectedTemplate }),
      setMood: (mood) => set({ mood }),
      setAudience: (audience) => set({ audience }),
      setLayoutPreference: (layoutPreference) => set({ layoutPreference }),

      getDesignPreferences: () => {
        const { mood, audience, layoutPreference } = get();
        return { mood, audience, layoutPreference };
      },

      isValid: () => {
        const { context } = get();
        return (
          context.length >= LIMITS.contextMinLength && context.length <= LIMITS.contextMaxLength
        );
      },

      charCount: () => get().context.length,

      reset: () =>
        set({
          context: '',
          selectedTemplate: null,
          mood: 'auto' as DesignMood,
          audience: 'general' as DesignAudience,
          layoutPreference: 'auto' as DesignLayout,
        }),
    }),
    {
      name: 'builder-context',
      partialize: (state) => ({
        context: state.context,
        selectedTemplate: state.selectedTemplate,
        mood: state.mood,
        audience: state.audience,
        layoutPreference: state.layoutPreference,
      }),
    }
  )
);
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/stores/contextStore.ts
git commit -m "feat: contextStore에 디자인 선호도 (mood, audience, layout) 상태 추가"
```

---

## Task 3: DesignPreferences UI 컴포넌트

**Files:**
- Create: `src/components/builder/DesignPreferences.tsx`

- [ ] **Step 1: 컴포넌트 생성**

```tsx
// src/components/builder/DesignPreferences.tsx
'use client';

import type { DesignMood, DesignAudience, DesignLayout } from '@/types/project';
import { useContextStore } from '@/stores/contextStore';

const MOOD_OPTIONS: { value: DesignMood; label: string }[] = [
  { value: 'auto', label: '자동' },
  { value: 'light', label: '밝고 깔끔' },
  { value: 'dark', label: '어둡고 세련' },
  { value: 'warm', label: '따뜻하고 친근' },
  { value: 'colorful', label: '화려하고 역동' },
  { value: 'minimal', label: '미니멀' },
];

const AUDIENCE_OPTIONS: { value: DesignAudience; label: string }[] = [
  { value: 'general', label: '일반' },
  { value: 'business', label: '비즈니스' },
  { value: 'youth', label: '젊은층' },
  { value: 'premium', label: '프리미엄' },
];

const LAYOUT_OPTIONS: { value: DesignLayout; label: string }[] = [
  { value: 'auto', label: '자동' },
  { value: 'dashboard', label: '대시보드' },
  { value: 'gallery', label: '갤러리' },
  { value: 'feed', label: '피드/목록' },
  { value: 'landing', label: '랜딩페이지' },
  { value: 'tool', label: '도구/유틸리티' },
];

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="rounded-lg px-3 py-1.5 text-sm transition-all duration-150"
            style={{
              background: value === opt.value ? 'var(--accent-primary)' : 'var(--bg-card)',
              color: value === opt.value ? 'white' : 'var(--text-secondary)',
              border: `1px solid ${value === opt.value ? 'var(--accent-primary)' : 'var(--border)'}`,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DesignPreferences() {
  const { mood, audience, layoutPreference, setMood, setAudience, setLayoutPreference } =
    useContextStore();

  return (
    <details className="group">
      <summary
        className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden"
        style={{ color: 'var(--text-muted)' }}
      >
        <svg
          className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        디자인 선호도 설정 (선택사항)
      </summary>
      <div className="mt-4 space-y-4 rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <ChipGroup label="분위기" options={MOOD_OPTIONS} value={mood} onChange={setMood} />
        <ChipGroup label="대상 고객" options={AUDIENCE_OPTIONS} value={audience} onChange={setAudience} />
        <ChipGroup label="레이아웃" options={LAYOUT_OPTIONS} value={layoutPreference} onChange={setLayoutPreference} />
      </div>
    </details>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/builder/DesignPreferences.tsx
git commit -m "feat: DesignPreferences 칩 그룹 UI 컴포넌트 생성"
```

---

## Task 4: 빌더 페이지에 DesignPreferences 통합

**Files:**
- Modify: `src/app/(main)/builder/page.tsx`

- [ ] **Step 1: import 추가**

`page.tsx` 상단 import 블록에 추가:
```typescript
import DesignPreferences from '@/components/builder/DesignPreferences';
```

- [ ] **Step 2: API-first mode Step 2에 컴포넌트 삽입**

API-first mode의 Step 2 (`{step === 2 && (`) 영역에서 `<TemplateSelector>` 바로 아래에:
```tsx
<DesignPreferences />
```

- [ ] **Step 3: Context-first mode Step 1에 컴포넌트 삽입**

Context-first mode의 Step 1 (`{step === 1 && (`) 영역에서 `<TemplateSelector>` 바로 아래에:
```tsx
<DesignPreferences />
```

- [ ] **Step 4: handleGenerate에 designPreferences 전달**

`handleGenerate` 내 프로젝트 생성 요청 body를 수정:
```typescript
// 기존
body: JSON.stringify({
  name: `프로젝트-${Date.now()}`,
  context,
  apiIds: selectedIds,
}),

// 변경 (useContextStore에서 getDesignPreferences 추가)
```

`handleGenerate` 상단의 useContextStore 디스트럭처링에 `getDesignPreferences` 추가:
```typescript
const {
  context,
  setContext,
  setTemplate,
  isValid: isContextValid,
  getDesignPreferences,
  reset: resetContext,
} = useContextStore();
```

그리고 fetch body:
```typescript
body: JSON.stringify({
  name: `프로젝트-${Date.now()}`,
  context,
  apiIds: selectedIds,
  designPreferences: getDesignPreferences(),
}),
```

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (API 스키마는 아직 `designPreferences`를 모르지만 extra field는 strip됨)

- [ ] **Step 6: 커밋**

```bash
git add src/app/(main)/builder/page.tsx
git commit -m "feat: 빌더 페이지에 DesignPreferences 컴포넌트 통합"
```

---

## Task 5: 프로젝트 생성 API에 designPreferences 수용

**Files:**
- Modify: `src/app/api/v1/projects/route.ts`
- Modify: `src/services/projectService.ts`

- [ ] **Step 1: Zod 스키마 확장**

`src/app/api/v1/projects/route.ts`의 스키마 수정:
```typescript
const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  context: z.string().min(50).max(2000),
  apiIds: z.array(z.string().uuid()).min(1).max(5),
  organizationId: z.string().uuid().optional(),
  designPreferences: z
    .object({
      mood: z.enum(['auto', 'light', 'dark', 'warm', 'colorful', 'minimal']).default('auto'),
      audience: z.enum(['general', 'business', 'youth', 'premium']).default('general'),
      layoutPreference: z.enum(['auto', 'dashboard', 'gallery', 'feed', 'landing', 'tool']).default('auto'),
    })
    .optional(),
});
```

- [ ] **Step 2: projectService.create()에서 metadata에 저장**

`src/services/projectService.ts`의 `create()` 메서드를 찾아 `designPreferences`를 `metadata`에 저장하도록 수정. ProjectService.create 인자에서 `input`을 통해 전달받고, DB insert 시 metadata 필드에 병합:

```typescript
// projectService.ts의 create 메서드 내
const metadata = {
  ...existingMetadata,
  ...(input.designPreferences ? { designPreferences: input.designPreferences } : {}),
};
```

- [ ] **Step 3: 타입 체크 및 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 전체 통과

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/v1/projects/route.ts src/services/projectService.ts
git commit -m "feat: 프로젝트 생성 API에 designPreferences 필드 수용"
```

---

## Task 6: 카테고리→디자인 매핑 모듈

**Files:**
- Create: `src/lib/ai/categoryDesignMap.ts`
- Create: `src/lib/ai/categoryDesignMap.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/lib/ai/categoryDesignMap.test.ts
import { describe, it, expect } from 'vitest';
import { inferDesignFromCategories } from './categoryDesignMap';

describe('inferDesignFromCategories', () => {
  it('금융 카테고리는 모던 다크를 추천한다', () => {
    const result = inferDesignFromCategories(['finance']);
    expect(result.theme).toBe('modern-dark');
    expect(result.useChart).toBe(true);
  });

  it('음식/여행 카테고리는 따뜻한 톤을 추천한다', () => {
    const result = inferDesignFromCategories(['tourism', 'lifestyle']);
    expect(result.theme).toBe('warm');
  });

  it('날씨 카테고리는 오션 블루를 추천한다', () => {
    const result = inferDesignFromCategories(['weather']);
    expect(result.theme).toBe('ocean-blue');
    expect(result.useChart).toBe(true);
  });

  it('엔터테인먼트 카테고리는 선셋 그래디언트를 추천한다', () => {
    const result = inferDesignFromCategories(['entertainment']);
    expect(result.theme).toBe('sunset-gradient');
  });

  it('빈 배열이면 클린 라이트 기본값을 반환한다', () => {
    const result = inferDesignFromCategories([]);
    expect(result.theme).toBe('clean-light');
  });

  it('복수 카테고리는 첫 번째 매칭 우선', () => {
    const result = inferDesignFromCategories(['finance', 'news']);
    expect(result.theme).toBe('modern-dark');
  });

  it('useMap은 지도 카테고리에서만 true', () => {
    expect(inferDesignFromCategories(['maps']).useMap).toBe(true);
    expect(inferDesignFromCategories(['news']).useMap).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/lib/ai/categoryDesignMap.test.ts`
Expected: FAIL — 모듈이 아직 없음

- [ ] **Step 3: 구현**

```typescript
// src/lib/ai/categoryDesignMap.ts

export interface DesignInference {
  theme: string;
  layout: string;
  useChart: boolean;
  useMap: boolean;
  description: string;
}

interface CategoryRule {
  categories: string[];
  theme: string;
  layout: string;
  useChart: boolean;
  useMap: boolean;
  description: string;
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    categories: ['finance'],
    theme: 'modern-dark',
    layout: 'watchlist-table-chart',
    useChart: true,
    useMap: false,
    description: '금융/투자 서비스 — 워치리스트 테이블 + 실시간 차트 + 종목 상세',
  },
  {
    categories: ['weather'],
    theme: 'ocean-blue',
    layout: 'status-card-chart',
    useChart: true,
    useMap: false,
    description: '날씨/환경 서비스 — 대형 현재 상태 카드 + 시간별 스크롤 + 주간 예보 차트',
  },
  {
    categories: ['entertainment', 'fun'],
    theme: 'sunset-gradient',
    layout: 'hero-carousel-grid',
    useChart: false,
    useMap: false,
    description: '엔터테인먼트 서비스 — 히어로 배너 + 가로 캐러셀 + 카드 그리드',
  },
  {
    categories: ['news', 'social'],
    theme: 'clean-light',
    layout: 'hero-tabs-grid-sidebar',
    useChart: false,
    useMap: false,
    description: '뉴스/미디어 서비스 — 히어로 헤드라인 + 카테고리 탭 + 카드 그리드 + 사이드바',
  },
  {
    categories: ['tourism', 'lifestyle'],
    theme: 'warm',
    layout: 'hero-image-carousel-grid',
    useChart: false,
    useMap: false,
    description: '여행/라이프스타일 서비스 — 큰 이미지 히어로 + 캐러셀 + 카드 그리드',
  },
  {
    categories: ['maps', 'location', 'transport', 'realestate'],
    theme: 'clean-light',
    layout: 'map-with-sidebar',
    useChart: false,
    useMap: true,
    description: '지도/위치 서비스 — Leaflet 전체 너비 지도 + 사이드 패널 목록 + 필터',
  },
  {
    categories: ['science', 'data'],
    theme: 'modern-dark',
    layout: 'dashboard-stats-chart',
    useChart: true,
    useMap: false,
    description: '데이터/과학 서비스 — 통계 대시보드 + 차트 + 데이터 테이블',
  },
  {
    categories: ['image'],
    theme: 'monochrome',
    layout: 'gallery-masonry',
    useChart: false,
    useMap: false,
    description: '이미지/갤러리 서비스 — 그리드 갤러리 + 필터 + 상세 모달',
  },
  {
    categories: ['utility', 'dictionary', 'translation'],
    theme: 'modern-dark',
    layout: 'split-input-output',
    useChart: false,
    useMap: false,
    description: '유틸리티/도구 서비스 — 좌우 분할 (입력/출력) + 히스토리 사이드바',
  },
];

const DEFAULT_INFERENCE: DesignInference = {
  theme: 'clean-light',
  layout: 'hero-tabs-grid',
  useChart: false,
  useMap: false,
  description: '일반 서비스 — 히어로 + 탭 + 카드 그리드 (기본 레이아웃)',
};

export function inferDesignFromCategories(categories: string[]): DesignInference {
  if (categories.length === 0) return DEFAULT_INFERENCE;

  const lowerCategories = categories.map((c) => c.toLowerCase());

  for (const rule of CATEGORY_RULES) {
    if (rule.categories.some((rc) => lowerCategories.includes(rc))) {
      return {
        theme: rule.theme,
        layout: rule.layout,
        useChart: rule.useChart,
        useMap: rule.useMap,
        description: rule.description,
      };
    }
  }

  return DEFAULT_INFERENCE;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/lib/ai/categoryDesignMap.test.ts`
Expected: 모든 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ai/categoryDesignMap.ts src/lib/ai/categoryDesignMap.test.ts
git commit -m "feat: API 카테고리→디자인 추론 매핑 모듈 (categoryDesignMap)"
```

---

## Task 7: buildUserPrompt에 선호도 + 카테고리 추론 통합

**Files:**
- Modify: `src/lib/ai/promptBuilder.ts:546-624`

- [ ] **Step 1: buildUserPrompt 시그니처 확장**

```typescript
// src/lib/ai/promptBuilder.ts

import type { DesignPreferences } from '@/types/project';
import { inferDesignFromCategories } from './categoryDesignMap';

// 기존 시그니처:
// export function buildUserPrompt(apis: ApiCatalogItem[], context: string, projectId?: string): string

// 변경:
export function buildUserPrompt(
  apis: ApiCatalogItem[],
  context: string,
  projectId?: string,
  designPreferences?: DesignPreferences
): string {
```

- [ ] **Step 2: API 카테고리 추론 + 선호도 섹션 추가**

`buildUserPrompt` 내 `return` 문의 `## 사용자 요청` 섹션 다음에 삽입:

```typescript
  // 카테고리 기반 디자인 추론
  const categories = [...new Set(apis.map((a) => a.category).filter(Boolean))];
  const inference = inferDesignFromCategories(categories);

  // 사용자 선호도 + AI 추론 결합
  const designSection = `
## 디자인 가이드

### API 분석 기반 추천
- 감지된 API 카테고리: ${categories.join(', ') || '없음'}
- 추천 서비스 유형: ${inference.description}
- 추천 테마: ${inference.theme}
- 추천 레이아웃: ${inference.layout}
- 차트 필요: ${inference.useChart ? '예 (Chart.js CDN 포함)' : '아니오 (Chart.js 불필요)'}
- 지도 필요: ${inference.useMap ? '예 (Leaflet CDN 포함)' : '아니오'}
${
  designPreferences && (designPreferences.mood !== 'auto' || designPreferences.audience !== 'general' || designPreferences.layoutPreference !== 'auto')
    ? `
### 사용자 선호도 (추천보다 우선)
${designPreferences.mood !== 'auto' ? `- 분위기: ${designPreferences.mood}` : ''}
${designPreferences.audience !== 'general' ? `- 대상 고객: ${designPreferences.audience}` : ''}
${designPreferences.layoutPreference !== 'auto' ? `- 레이아웃: ${designPreferences.layoutPreference}` : ''}
사용자가 명시한 선호도는 위 AI 추천보다 우선 적용하세요.`
    : '위 추천을 기반으로 디자인하되, 사용자 요청에 더 적합한 대안이 있으면 자율적으로 변경 가능.'
}`;

  return `## 선택된 API 목록

${apiDescriptions}

## 사용자 요청
${context}
${designSection}

## 구현 지시
...`; // 이하 기존과 동일
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/lib/ai/promptBuilder.ts
git commit -m "feat: buildUserPrompt에 카테고리 추론 + 사용자 선호도 섹션 추가"
```

---

## Task 8: generate route에 카테고리/선호도 전달

**Files:**
- Modify: `src/app/api/v1/generate/route.ts:68-75`

- [ ] **Step 1: 프로젝트 metadata에서 선호도 읽기 + 프롬프트에 전달**

generate route의 프롬프트 빌드 부분을 수정:

```typescript
// 기존 (line 74-75):
const systemPrompt = buildSystemPrompt();
const userPrompt = buildUserPrompt(apis, project.context);

// 변경:
const systemPrompt = buildSystemPrompt();
const designPreferences = project.metadata?.designPreferences as DesignPreferences | undefined;
const userPrompt = buildUserPrompt(apis, project.context, project.id, designPreferences);
```

import에 추가:
```typescript
import type { DesignPreferences } from '@/types/project';
```

- [ ] **Step 2: metadata에 카테고리/추론 정보 저장**

코드 저장 시 metadata에 카테고리 정보 추가:
```typescript
import { inferDesignFromCategories } from '@/lib/ai/categoryDesignMap';

// ... 코드 저장 부분에서:
const categories = [...new Set(apis.map((a) => a.category).filter(Boolean))];
const inference = inferDesignFromCategories(categories);

metadata: {
  securityCheckPassed: validation.passed,
  validationErrors: [...validation.errors, ...validation.warnings],
  ...evaluateQuality(parsed.html, parsed.css, parsed.js),
  apiCategories: categories,
  inferredTheme: inference.theme,
  inferredLayout: inference.layout,
},
```

- [ ] **Step 3: regenerate route에도 동일 적용**

`src/app/api/v1/generate/regenerate/route.ts`에도 동일하게 `DesignPreferences` import, `buildUserPrompt` 호출 시 4번째 인자 전달, metadata에 카테고리 저장.

- [ ] **Step 4: 테스트 mock 업데이트**

`src/__tests__/api/generate.test.ts`의 `promptBuilder` mock에 4번째 인자 수용:
```typescript
vi.mock('@/lib/ai/promptBuilder', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('system prompt'),
  buildUserPrompt: vi.fn().mockReturnValue('user prompt'),
}));
```
(mock은 인자를 무시하므로 변경 불필요. 단, `categoryDesignMap` mock 추가:)

```typescript
vi.mock('@/lib/ai/categoryDesignMap', () => ({
  inferDesignFromCategories: vi.fn().mockReturnValue({
    theme: 'clean-light',
    layout: 'hero-tabs-grid',
    useChart: false,
    useMap: false,
    description: 'test',
  }),
}));
```

- [ ] **Step 5: 테스트 실행**

Run: `npx vitest run`
Expected: 전체 통과

- [ ] **Step 6: 커밋**

```bash
git add src/app/api/v1/generate/route.ts src/app/api/v1/generate/regenerate/route.ts src/__tests__/api/generate.test.ts
git commit -m "feat: generate/regenerate route에 카테고리 추론 + 선호도 프롬프트 전달"
```

---

## Task 9: 품질 자동 재생성 루프

**Files:**
- Create: `src/lib/ai/qualityLoop.ts`
- Create: `src/lib/ai/qualityLoop.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/lib/ai/qualityLoop.test.ts
import { describe, it, expect } from 'vitest';
import { shouldRetryGeneration, buildQualityImprovementPrompt } from './qualityLoop';
import type { QualityMetrics } from '@/lib/ai/codeValidator';

describe('shouldRetryGeneration', () => {
  it('점수 40 미만이면 true를 반환한다', () => {
    const metrics: QualityMetrics = {
      structuralScore: 30,
      hasSemanticHtml: false,
      hasMockData: false,
      hasInteraction: false,
      hasResponsiveClasses: true,
      hasFooter: false,
      hasImgAlt: false,
      details: ['시맨틱 HTML 부족', '목 데이터 배열이 감지되지 않았습니다'],
    };
    expect(shouldRetryGeneration(metrics)).toBe(true);
  });

  it('점수 40 이상이면 false를 반환한다', () => {
    const metrics: QualityMetrics = {
      structuralScore: 70,
      hasSemanticHtml: true,
      hasMockData: true,
      hasInteraction: true,
      hasResponsiveClasses: true,
      hasFooter: true,
      hasImgAlt: true,
      details: [],
    };
    expect(shouldRetryGeneration(metrics)).toBe(false);
  });
});

describe('buildQualityImprovementPrompt', () => {
  it('details 목록을 개선 지시에 포함한다', () => {
    const metrics: QualityMetrics = {
      structuralScore: 30,
      hasSemanticHtml: false,
      hasMockData: false,
      hasInteraction: true,
      hasResponsiveClasses: true,
      hasFooter: false,
      hasImgAlt: false,
      details: ['시맨틱 HTML 부족', '<footer> 태그가 없습니다'],
    };
    const prompt = buildQualityImprovementPrompt(
      { html: '<div>test</div>', css: '', js: '' },
      metrics
    );
    expect(prompt).toContain('시맨틱 HTML 부족');
    expect(prompt).toContain('<footer>');
    expect(prompt).toContain('이전 생성 코드');
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/lib/ai/qualityLoop.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

```typescript
// src/lib/ai/qualityLoop.ts
import type { QualityMetrics } from '@/lib/ai/codeValidator';

const QUALITY_THRESHOLD = 40;

export function shouldRetryGeneration(metrics: QualityMetrics): boolean {
  return metrics.structuralScore < QUALITY_THRESHOLD;
}

export function buildQualityImprovementPrompt(
  previousCode: { html: string; css: string; js: string },
  metrics: QualityMetrics
): string {
  const issues = metrics.details.map((d) => `- ${d}`).join('\n');

  return `## 이전 생성 코드

### HTML
\`\`\`html
${previousCode.html}
\`\`\`

### CSS
\`\`\`css
${previousCode.css}
\`\`\`

### JavaScript
\`\`\`javascript
${previousCode.js}
\`\`\`

## 품질 개선 요청

이전 코드의 품질 점수가 ${metrics.structuralScore}/100으로 기준(${QUALITY_THRESHOLD}) 미달입니다.
아래 문제를 반드시 수정하세요:

${issues}

수정 규칙:
- 기존 기능과 디자인은 최대한 유지하면서 위 문제만 정확히 수정
- 시맨틱 HTML 태그(<main>, <nav>, <footer>, <article>) 사용
- 모든 <img>에 한국어 alt 속성 추가
- 목 데이터가 없다면 const 배열로 최소 15개 추가
- <footer> 태그로 서비스명 + 저작권 + 링크 포함
- 반응형 클래스(sm:/md:/lg:) 사용
- addEventListener로 인터랙션 추가 (탭, 검색, 모달)

전체 코드를 반환해주세요:

### HTML
\`\`\`html
(완전한 HTML 코드)
\`\`\`

### CSS
\`\`\`css
(CSS 코드)
\`\`\`

### JavaScript
\`\`\`javascript
(JavaScript 코드)
\`\`\``;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/lib/ai/qualityLoop.test.ts`
Expected: 모든 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ai/qualityLoop.ts src/lib/ai/qualityLoop.test.ts
git commit -m "feat: 품질 자동 재생성 판단 + 개선 프롬프트 생성 모듈"
```

---

## Task 10: generate route에 품질 루프 통합

**Files:**
- Modify: `src/app/api/v1/generate/route.ts`

- [ ] **Step 1: import 추가**

```typescript
import { shouldRetryGeneration, buildQualityImprovementPrompt } from '@/lib/ai/qualityLoop';
```

- [ ] **Step 2: 코드 검증 후 품질 루프 삽입**

generate route의 `validateAll` 이후, 코드 저장 전에:

```typescript
const quality = evaluateQuality(parsed.html, parsed.css, parsed.js);

// 품질 자동 재생성 (1회 제한)
if (shouldRetryGeneration(quality)) {
  logger.info('Quality below threshold, attempting improvement', {
    projectId,
    score: quality.structuralScore,
  });

  send('progress', {
    step: 'quality_improvement',
    progress: 92,
    message: '품질 개선 중...',
  });

  const improvementPrompt = buildQualityImprovementPrompt(parsed, quality);
  const retryResponse = await provider.generateCode(systemPrompt, improvementPrompt);
  const retryParsed = parseGeneratedCode(retryResponse.content);

  if (retryParsed.html) {
    const retryQuality = evaluateQuality(retryParsed.html, retryParsed.css, retryParsed.js);
    if (retryQuality.structuralScore > quality.structuralScore) {
      // 개선된 코드 사용
      parsed = retryParsed;
      quality = retryQuality;
      quality.qualityLoopUsed = true;
    }
  }
}
```

Note: `parsed`를 `let`으로 변경 필요:
```typescript
// 기존: const parsed = parseGeneratedCode(...)
// 변경: let parsed = parseGeneratedCode(...)
```

- [ ] **Step 3: metadata에 품질 루프 사용 여부 저장**

```typescript
metadata: {
  ...existingMetadata,
  qualityLoopUsed: quality.qualityLoopUsed ?? false,
},
```

- [ ] **Step 4: 테스트 mock 업데이트**

`src/__tests__/api/generate.test.ts`에 mock 추가:
```typescript
vi.mock('@/lib/ai/qualityLoop', () => ({
  shouldRetryGeneration: vi.fn().mockReturnValue(false),
  buildQualityImprovementPrompt: vi.fn().mockReturnValue('improvement prompt'),
}));
```

- [ ] **Step 5: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 전체 통과

- [ ] **Step 6: 커밋**

```bash
git add src/app/api/v1/generate/route.ts src/__tests__/api/generate.test.ts
git commit -m "feat: generate route에 품질 < 40 자동 재생성 루프 통합"
```

---

## Task 11: evaluateQuality 테스트 보강

**Files:**
- Modify: `src/lib/ai/codeValidator.test.ts`

- [ ] **Step 1: evaluateQuality 테스트 추가**

기존 파일 하단에 추가:

```typescript
import { evaluateQuality } from './codeValidator';

describe('evaluateQuality', () => {
  it('모든 품질 요소가 있으면 점수 100을 반환한다', () => {
    const html = `<!DOCTYPE html><html><head></head><body>
      <nav>네비</nav>
      <main>
        <article>
          <img src="https://picsum.photos/seed/a/600/400" alt="테스트 이미지">
        </article>
      </main>
      <footer>푸터</footer>
      <div class="sm:grid-cols-2 lg:grid-cols-3 transition-all">카드</div>
    </body></html>`;
    const js = `
      const mockData = [{ id: 1, title: '테스트' }];
      document.addEventListener('DOMContentLoaded', () => {});
      btn.addEventListener('click', () => {});
      el.addEventListener('input', () => {});
    `;
    const result = evaluateQuality(html, '', js);
    expect(result.structuralScore).toBe(100);
    expect(result.hasSemanticHtml).toBe(true);
    expect(result.hasMockData).toBe(true);
    expect(result.hasInteraction).toBe(true);
    expect(result.hasFooter).toBe(true);
  });

  it('빈 코드는 낮은 점수를 반환한다', () => {
    const result = evaluateQuality('<div></div>', '', '');
    expect(result.structuralScore).toBeLessThan(30);
    expect(result.hasMockData).toBe(false);
    expect(result.hasInteraction).toBe(false);
  });

  it('details에 부족한 항목이 나열된다', () => {
    const result = evaluateQuality('<div></div>', '', '');
    expect(result.details.length).toBeGreaterThan(0);
    expect(result.details.some((d) => d.includes('시맨틱'))).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `npx vitest run src/lib/ai/codeValidator.test.ts`
Expected: 전체 통과

- [ ] **Step 3: 커밋**

```bash
git add src/lib/ai/codeValidator.test.ts
git commit -m "test: evaluateQuality 품질 스코어링 테스트 보강"
```

---

## Task 12: 최종 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 2: 전체 테스트**

Run: `npx vitest run`
Expected: 전체 통과

- [ ] **Step 3: 린트**

Run: `pnpm lint`
Expected: 에러 없음

- [ ] **Step 4: 최종 커밋 (있다면)**

린트 수정 등이 필요하면 커밋.

---

## 검증 방법 (수동)

### 프롬프트 변경 효과 확인
1. 동일한 API + 컨텍스트로 변경 전/후 각각 3회 생성
2. 비교 항목: 접근성 태그, 푸터, 로딩 상태, 타이포그래피 일관성, 테마 다양성
3. Chrome DevTools Lighthouse 점수 비교 (접근성, 성능, SEO)

### 디자인 선호도 동작 확인
1. 빌더에서 "어둡고 세련" + "비즈니스" + "대시보드" 선택 → 생성
2. 결과가 다크 테마 + 대시보드 레이아웃인지 확인
3. "자동" 선택 시 API 카테고리 기반 추론이 동작하는지 확인

### 품질 루프 동작 확인
1. 대시보드에서 생성된 코드의 `metadata.structuralScore` 확인
2. `qualityLoopUsed: true`인 프로젝트가 있는지 확인
3. 루프 사용 전/후 점수 비교
