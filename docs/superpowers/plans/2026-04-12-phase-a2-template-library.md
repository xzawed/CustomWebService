# Phase A-2 공식 템플릿 라이브러리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빌더에서 선택한 템플릿 ID가 AI 코드 생성 프롬프트에 실질적으로 반영되도록 TemplateRegistry를 활성화하고, 11개 전체 템플릿을 완성한다.

**Architecture:** TemplateRegistry(이미 존재, 미연결)를 generate/route.ts에 연결한다. 선택한 templateId를 useGeneration 훅 → API body → TemplateRegistry.get() → template.generate().promptHint → buildSystemPrompt() 순으로 전달한다. categoryDesignMap은 templateId 없을 때 fallback으로 유지된다.

**Tech Stack:** TypeScript strict, Next.js App Router, Vitest, Zustand, 기존 ICodeTemplate 인터페이스

---

## 파일 구조

| 역할 | 파일 | 변경 유형 |
|------|------|-----------|
| 프롬프트 빌더 | `src/lib/ai/promptBuilder.ts` | 수정 — templateHint 파라미터 추가 |
| 생성 API 라우트 | `src/app/api/v1/generate/route.ts` | 수정 — templateId 파싱 + Registry 조회 |
| 생성 훅 | `src/hooks/useGeneration.ts` | 수정 — templateId 파라미터 추가 |
| 템플릿 레지스트리 | `src/templates/TemplateRegistry.ts` | 수정 — 11개 전체 등록 |
| 기존 템플릿 3개 | `src/templates/DashboardTemplate.ts` 외 2개 | 수정 — promptHint 보강 |
| 신규 템플릿 8개 | `src/templates/InfoLookupTemplate.ts` 외 7개 | 신규 생성 |
| 템플릿 선택 UI | `src/components/builder/TemplateSelector.tsx` | 수정 — 5개 버튼 추가 |
| 생성 테스트 | `src/__tests__/api/generate.test.ts` | 수정 — templateId 케이스 추가 |

---

## Task 1: promptBuilder.ts — templateHint 파라미터 추가

**Files:**
- Modify: `src/lib/ai/promptBuilder.ts`
- Modify: `src/__tests__/api/generate.test.ts`

### 현재 `buildSystemPrompt` 시그니처 (참고용)

```typescript
// 현재: 캐시 사용, 파라미터 없음
let cachedSystemPrompt: string | null = null;
export function buildSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  cachedSystemPrompt = _buildSystemPrompt();
  return cachedSystemPrompt;
}
```

- [ ] **Step 1: generate.test.ts에 templateHint 관련 테스트 추가**

`src/__tests__/api/generate.test.ts` 파일의 `describe('POST /api/v1/generate', ...)` 블록 안, 마지막 `it()` 뒤에 다음 두 케이스를 추가한다:

```typescript
it('templateId 전달 시 시스템 프롬프트에 Template Guidance가 포함된다', async () => {
  await setupHappyPath();

  const { buildSystemPrompt } = await import('@/lib/ai/promptBuilder');

  const { POST } = await import('@/app/api/v1/generate/route');
  await POST(makeRequest({ projectId: 'proj-1', templateId: 'dashboard' }));

  // buildSystemPrompt가 templateHint와 함께 호출됐는지 확인
  expect(vi.mocked(buildSystemPrompt)).toHaveBeenCalledWith(
    expect.stringContaining('Layout:')
  );
});

it('templateId 없을 때 buildSystemPrompt를 undefined로 호출한다', async () => {
  await setupHappyPath();

  const { buildSystemPrompt } = await import('@/lib/ai/promptBuilder');

  const { POST } = await import('@/app/api/v1/generate/route');
  await POST(makeRequest({ projectId: 'proj-1' }));

  expect(vi.mocked(buildSystemPrompt)).toHaveBeenCalledWith(undefined);
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd f:/DEVELOPMENT/SOURCE/CLAUDE/CustomWebService
pnpm test src/__tests__/api/generate.test.ts
```

Expected: 새 2개 테스트 FAIL (buildSystemPrompt 시그니처 불일치)

- [ ] **Step 3: `promptBuilder.ts` — buildSystemPrompt에 templateHint 파라미터 추가**

`src/lib/ai/promptBuilder.ts` 상단의 `buildSystemPrompt` 함수를 다음으로 교체한다 (캐시는 base에만 유지):

```typescript
// 시스템 프롬프트 모듈 레벨 캐싱 — base 프롬프트만 캐시
let cachedSystemPrompt: string | null = null;

export function buildSystemPrompt(templateHint?: string): string {
  const base = cachedSystemPrompt ?? (cachedSystemPrompt = _buildSystemPrompt());
  if (!templateHint) return base;
  return `${base}

[Template Guidance]
${templateHint}
Strictly follow the above layout structure. The section arrangement and UI patterns described above are mandatory. Fill in content and API integrations within this structure.`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test src/__tests__/api/generate.test.ts
```

Expected: 모든 테스트 PASS (기존 테스트 포함)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ai/promptBuilder.ts src/__tests__/api/generate.test.ts
git commit -m "feat: buildSystemPrompt에 templateHint 파라미터 추가"
```

---

## Task 2: generate/route.ts — templateId 파싱 및 Registry 연결

**Files:**
- Modify: `src/app/api/v1/generate/route.ts`

### 현재 body 파싱 코드 (참고용, route.ts 43~55줄)

```typescript
let projectId: string;
try {
  const body = await request.json();
  if (typeof body.projectId !== 'string' || !body.projectId) {
    throw new ValidationError('projectId는 필수 항목입니다.');
  }
  projectId = body.projectId;
} catch (err) {
  if (err instanceof SyntaxError) {
    return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
  }
  throw err;
}
```

- [ ] **Step 1: route.ts import에 templateRegistry 추가**

`src/app/api/v1/generate/route.ts` 파일의 import 블록에 다음을 추가한다 (기존 import들 아래):

```typescript
import { templateRegistry } from '@/templates/TemplateRegistry';
```

- [ ] **Step 2: body 파싱에 templateId 추출 추가**

`let projectId: string;` 선언 아래에 `let templateId: string | undefined;` 선언을 추가하고, body 파싱 블록을 다음으로 교체한다:

```typescript
let projectId: string;
let templateId: string | undefined;
try {
  const body = await request.json();
  if (typeof body.projectId !== 'string' || !body.projectId) {
    throw new ValidationError('projectId는 필수 항목입니다.');
  }
  projectId = body.projectId;
  templateId = typeof body.templateId === 'string' ? body.templateId : undefined;
} catch (err) {
  if (err instanceof SyntaxError) {
    return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
  }
  throw err;
}
```

- [ ] **Step 3: buildSystemPrompt 호출부에 templateHint 주입**

`route.ts`에서 `buildSystemPrompt()` 호출 위치를 찾는다 (현재 88줄):

```typescript
const systemPrompt = buildSystemPrompt();
```

이 줄을 다음으로 교체한다:

```typescript
// 템플릿 힌트 조회 (templateId가 있고 Registry에 등록된 경우에만)
const templateHint = templateId
  ? templateRegistry.get(templateId)?.generate({
      apis,
      userContext: project.context,
      templateId,
    }).promptHint
  : undefined;

const systemPrompt = buildSystemPrompt(templateHint);
```

- [ ] **Step 4: 전체 테스트 통과 확인**

```bash
pnpm test
```

Expected: 286개 기존 + 2개 신규 = 288개 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/v1/generate/route.ts
git commit -m "feat: generate route에 templateId 파싱 및 TemplateRegistry 연결"
```

---

## Task 3: useGeneration.ts — templateId를 generate API에 전달

**Files:**
- Modify: `src/hooks/useGeneration.ts`

### 현재 startGeneration 시그니처 (참고용)

```typescript
const startGeneration = useCallback(
  async (projectId: string) => {
    ...
    body: JSON.stringify({ projectId }),
```

- [ ] **Step 1: useGeneration.ts의 startGeneration에 templateId 파라미터 추가**

`src/hooks/useGeneration.ts`에서 인터페이스와 함수 시그니처를 다음과 같이 변경한다:

```typescript
interface UseGenerationReturn {
  status: string;
  progress: number;
  currentStep: string;
  projectId: string | null;
  version: number | null;
  error: string | null;
  startGeneration: (projectId: string, templateId?: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}
```

`startGeneration` 함수 선언을:

```typescript
const startGeneration = useCallback(
  async (projectId: string, templateId?: string) => {
```

으로 변경하고, fetch body를:

```typescript
body: JSON.stringify({ projectId, templateId }),
```

으로 변경한다.

- [ ] **Step 2: builder page에서 startGeneration 호출 확인**

```bash
grep -rn "startGeneration" f:/DEVELOPMENT/SOURCE/CLAUDE/CustomWebService/src/
```

`startGeneration(projectId)` 호출 패턴을 찾는다. 호출 시 두 번째 인자로 `useContextStore.getState().selectedTemplate ?? undefined`를 전달하도록 수정한다.

예: `src/app/(main)/builder/page.tsx` 또는 관련 컴포넌트에서:

```typescript
// 변경 전
startGeneration(projectId)

// 변경 후
import { useContextStore } from '@/stores/contextStore';
// ...
const templateId = useContextStore.getState().selectedTemplate ?? undefined;
startGeneration(projectId, templateId)
```

- [ ] **Step 3: 타입 체크**

```bash
pnpm type-check
```

Expected: 에러 없음

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test
```

Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/hooks/useGeneration.ts
git add -p src/app/  # builder page 변경분
git commit -m "feat: useGeneration에 templateId 전달 연결"
```

---

## Task 4: 기존 3개 템플릿 promptHint 보강

**Files:**
- Modify: `src/templates/DashboardTemplate.ts`
- Modify: `src/templates/CalculatorTemplate.ts`
- Modify: `src/templates/GalleryTemplate.ts`

- [ ] **Step 1: DashboardTemplate.ts promptHint 교체**

`src/templates/DashboardTemplate.ts`의 `generate()` 메서드 반환값 `promptHint` 필드를 다음으로 교체한다:

```typescript
promptHint: `Layout: data-dashboard
Required sections (in order): sticky header with title and refresh button, metric cards row (4 cards minimum with icon + big number + label + trend %), main chart area (Chart.js bar or line chart with real data), secondary data table or list
UI patterns: card-based grid layout with subtle shadows, real-time refresh button, loading skeleton states visible before data loads
Must include: at least one Chart.js chart with meaningful numeric data array, grid-cols-2 lg:grid-cols-4 stats row at top, last-updated timestamp display
Avoid: hero images, marketing copy, decorative illustrations, empty charts`,
```

- [ ] **Step 2: CalculatorTemplate.ts promptHint 교체**

`src/templates/CalculatorTemplate.ts`의 `generate()` 반환값 `promptHint` 필드를 다음으로 교체한다 (generate 메서드의 마지막 return 객체에서):

```typescript
promptHint: `Layout: calculator-converter
Required sections (in order): header with tool title, split layout (left: input controls, right: result display), conversion history list (last 5 entries), optional presets/quick-pick buttons
UI patterns: large prominent result display (text-4xl font-bold), input and output clearly separated with an arrow or equals sign, history items as dismissible chips
Must include: real-time calculation on input change (oninput event), copy-to-clipboard button on result, at least 3 preset example values
Avoid: complex navigation, image grids, news feeds`,
```

- [ ] **Step 3: GalleryTemplate.ts promptHint 교체**

`src/templates/GalleryTemplate.ts`의 `generate()` 반환값 `promptHint` 필드를 다음으로 교체한다:

```typescript
promptHint: `Layout: masonry-gallery
Required sections (in order): header with search bar and category filter buttons, masonry or uniform grid of image cards (min 9 mock items), lightbox modal on card click, pagination or load-more button
UI patterns: cards with image (aspect-video), hover overlay with title, smooth transition on hover (scale-105), modal with full image + close button
Must include: category filter tabs (All + at least 3 categories), search input that filters displayed items, at least 9 pre-populated mock image cards using Unsplash URLs
Avoid: dashboard charts, tables, sidebars with data lists`,
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test
```

Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/templates/DashboardTemplate.ts src/templates/CalculatorTemplate.ts src/templates/GalleryTemplate.ts
git commit -m "feat: 기존 3개 템플릿 promptHint 보강"
```

---

## Task 5: 신규 템플릿 클래스 4개 (InfoLookup, Map, Feed, Comparison)

**Files:**
- Create: `src/templates/InfoLookupTemplate.ts`
- Create: `src/templates/MapTemplate.ts`
- Create: `src/templates/FeedTemplate.ts`
- Create: `src/templates/ComparisonTemplate.ts`

> **참고**: TemplateSelector의 기존 ID가 `map`, `feed`이므로 클래스 id도 동일하게 사용한다.

- [ ] **Step 1: InfoLookupTemplate.ts 생성**

파일 `src/templates/InfoLookupTemplate.ts` 생성:

```typescript
import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class InfoLookupTemplate implements ICodeTemplate {
  readonly id = 'info-lookup';
  readonly name = '정보 조회';
  readonly description = '검색어 입력 → 상세 정보 카드 표시';
  readonly category = 'lookup';
  readonly supportedApiCategories = [
    '정보', '조회', '검색', '백과', 'info', 'lookup', 'search', 'wiki', 'dictionary',
  ];

  matchScore(apis: ApiCatalogItem[]): number {
    const matching = apis.filter((api) =>
      this.supportedApiCategories.some((cat) =>
        api.category.toLowerCase().includes(cat.toLowerCase()) ||
        api.name.toLowerCase().includes(cat.toLowerCase()) ||
        api.description.toLowerCase().includes(cat.toLowerCase())
      )
    );
    return apis.length > 0 ? matching.length / apis.length : 0;
  }

  generate(_context: TemplateContext): TemplateOutput {
    return {
      html: `<div class="lookup-app">
  <header class="lookup-header">
    <h1>정보 조회</h1>
    <div class="search-bar">
      <input type="text" id="search-input" placeholder="검색어를 입력하세요..." />
      <button onclick="doSearch()">검색</button>
    </div>
  </header>
  <main class="lookup-main">
    <div id="result-card" class="result-card hidden"></div>
    <div id="related-list" class="related-list"></div>
  </main>
</div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #f8fafc; }
.lookup-app { max-width: 900px; margin: 0 auto; padding: 2rem; }
.search-bar { display: flex; gap: 0.5rem; margin-top: 1rem; }
.search-bar input { flex: 1; padding: 0.75rem 1rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 1rem; }
.search-bar button { padding: 0.75rem 1.5rem; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; }
.result-card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin: 1.5rem 0; }
.hidden { display: none; }`,
      js: `function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  const card = document.getElementById('result-card');
  card.innerHTML = '<p>검색 중...</p>';
  card.classList.remove('hidden');
}`,
      promptHint: `Layout: info-lookup
Required sections (in order): sticky header with prominent search bar (large input + search button), result detail card (shows after search — image left, info right with title/subtitle/tags/description), related items row (3-4 smaller cards below main result), empty/default state with suggested searches
UI patterns: search bar is the focal point (centered, large, hero-style), result card appears with subtle fade-in animation, related items as horizontal scroll on mobile
Must include: at least 6 mock pre-populated search results accessible by typing keywords, keyboard shortcut (Enter to search), loading skeleton while fetching
Avoid: dashboards with charts, image galleries, map components`,
    };
  }
}
```

- [ ] **Step 2: MapTemplate.ts 생성**

파일 `src/templates/MapTemplate.ts` 생성:

```typescript
import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class MapTemplate implements ICodeTemplate {
  readonly id = 'map';
  readonly name = '지도 서비스';
  readonly description = 'Leaflet 지도 + 사이드바 목록';
  readonly category = 'map';
  readonly supportedApiCategories = [
    '지도', '위치', '장소', '부동산', '교통', 'map', 'location', 'place', 'geo', 'transport',
  ];

  matchScore(apis: ApiCatalogItem[]): number {
    const matching = apis.filter((api) =>
      this.supportedApiCategories.some((cat) =>
        api.category.toLowerCase().includes(cat.toLowerCase()) ||
        api.name.toLowerCase().includes(cat.toLowerCase()) ||
        api.description.toLowerCase().includes(cat.toLowerCase())
      )
    );
    return apis.length > 0 ? matching.length / apis.length : 0;
  }

  generate(_context: TemplateContext): TemplateOutput {
    return {
      html: `<div class="map-app">
  <aside class="map-sidebar" id="sidebar">
    <div class="sidebar-header">
      <h2>장소 목록</h2>
      <input type="text" id="filter-input" placeholder="필터..." />
    </div>
    <ul class="place-list" id="place-list"></ul>
  </aside>
  <div id="map" class="map-container"></div>
</div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; }
.map-app { display: flex; height: 100vh; }
.map-sidebar { width: 320px; background: white; border-right: 1px solid #e2e8f0; overflow-y: auto; flex-shrink: 0; }
.sidebar-header { padding: 1rem; border-bottom: 1px solid #e2e8f0; }
.sidebar-header h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem; }
.sidebar-header input { width: 100%; padding: 0.5rem; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.875rem; }
.map-container { flex: 1; }
.place-list { list-style: none; }`,
      js: `// Leaflet map initialization
const map = L.map('map').setView([37.5665, 126.9780], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);`,
      promptHint: `Layout: map-with-sidebar
Required sections (in order): full-height left sidebar (320px fixed width) with title + filter input + scrollable place list items, full-height Leaflet map taking remaining width, marker popups on click showing place details
UI patterns: sidebar items are clickable rows (icon + name + category tag), clicking a sidebar item pans map to that marker and opens popup, filter input filters sidebar list in real-time
Must include: Leaflet CDN (leaflet.css + leaflet.js), at least 8 mock locations with lat/lng coordinates pre-loaded as markers, custom marker colors by category
Avoid: hero images, card grids, chart components, news feeds`,
    };
  }
}
```

- [ ] **Step 3: FeedTemplate.ts 생성**

파일 `src/templates/FeedTemplate.ts` 생성:

```typescript
import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class FeedTemplate implements ICodeTemplate {
  readonly id = 'feed';
  readonly name = '콘텐츠 피드';
  readonly description = '카드 리스트 + 카테고리 탭 + 무한스크롤';
  readonly category = 'feed';
  readonly supportedApiCategories = [
    '뉴스', '피드', '콘텐츠', '미디어', 'news', 'feed', 'content', 'media', 'blog', 'rss',
  ];

  matchScore(apis: ApiCatalogItem[]): number {
    const matching = apis.filter((api) =>
      this.supportedApiCategories.some((cat) =>
        api.category.toLowerCase().includes(cat.toLowerCase()) ||
        api.name.toLowerCase().includes(cat.toLowerCase()) ||
        api.description.toLowerCase().includes(cat.toLowerCase())
      )
    );
    return apis.length > 0 ? matching.length / apis.length : 0;
  }

  generate(_context: TemplateContext): TemplateOutput {
    return {
      html: `<div class="feed-app">
  <header class="feed-header">
    <h1>콘텐츠 피드</h1>
  </header>
  <nav class="category-tabs" id="tabs"></nav>
  <main class="feed-main">
    <div class="feed-grid" id="feed-grid"></div>
    <button class="load-more" id="load-more">더 보기</button>
  </main>
</div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #f8fafc; }
.feed-app { max-width: 1200px; margin: 0 auto; padding: 1rem; }
.feed-header { padding: 1rem 0; }
.category-tabs { display: flex; gap: 0.5rem; padding: 1rem 0; overflow-x: auto; }
.tab-btn { padding: 0.5rem 1rem; border: 1px solid #e2e8f0; border-radius: 20px; background: white; cursor: pointer; white-space: nowrap; font-size: 0.875rem; }
.tab-btn.active { background: #3b82f6; color: white; border-color: #3b82f6; }
.feed-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; margin-top: 1rem; }
.load-more { display: block; margin: 2rem auto; padding: 0.75rem 2rem; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; }`,
      js: `const CATEGORIES = ['전체', '기술', '과학', '문화', '경제'];
let currentCategory = '전체';
const tabs = document.getElementById('tabs');
CATEGORIES.forEach(cat => {
  const btn = document.createElement('button');
  btn.className = 'tab-btn' + (cat === currentCategory ? ' active' : '');
  btn.textContent = cat;
  btn.onclick = () => { currentCategory = cat; renderFeed(); };
  tabs.appendChild(btn);
});
function renderFeed() { /* API fetch + render */ }
renderFeed();`,
      promptHint: `Layout: content-feed
Required sections (in order): sticky header with service title and search icon, horizontal scrollable category tab bar (전체 + at least 4 categories, pill-shaped buttons), responsive card grid (grid-cols-1 sm:grid-cols-2 lg:grid-cols-3), each card has thumbnail image + category badge + title + excerpt + date + read-more link, load-more button at bottom
UI patterns: active tab highlighted with filled color, cards have hover shadow lift effect, thumbnail images use aspect-video with object-cover
Must include: at least 12 mock feed items pre-populated across categories, category tab click filters visible cards, search input in header filters by title
Avoid: map components, chart.js charts, calculator inputs`,
    };
  }
}
```

- [ ] **Step 4: ComparisonTemplate.ts 생성**

파일 `src/templates/ComparisonTemplate.ts` 생성:

```typescript
import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class ComparisonTemplate implements ICodeTemplate {
  readonly id = 'comparison';
  readonly name = '실시간 비교';
  readonly description = '두 항목을 나란히 비교하는 서비스';
  readonly category = 'comparison';
  readonly supportedApiCategories = [
    '비교', '금융', '환율', '주식', '가격', 'compare', 'finance', 'exchange', 'price', 'stock',
  ];

  matchScore(apis: ApiCatalogItem[]): number {
    const matching = apis.filter((api) =>
      this.supportedApiCategories.some((cat) =>
        api.category.toLowerCase().includes(cat.toLowerCase()) ||
        api.name.toLowerCase().includes(cat.toLowerCase()) ||
        api.description.toLowerCase().includes(cat.toLowerCase())
      )
    );
    return apis.length > 0 ? matching.length / apis.length : 0;
  }

  generate(_context: TemplateContext): TemplateOutput {
    return {
      html: `<div class="compare-app">
  <header><h1>실시간 비교</h1></header>
  <div class="compare-controls">
    <select id="item-a"></select>
    <span class="vs">VS</span>
    <select id="item-b"></select>
  </div>
  <div class="compare-grid">
    <div class="compare-card" id="card-a"></div>
    <div class="compare-card" id="card-b"></div>
  </div>
</div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #f8fafc; }
.compare-app { max-width: 1100px; margin: 0 auto; padding: 2rem; }
.compare-controls { display: flex; align-items: center; gap: 1rem; justify-content: center; margin: 1.5rem 0; }
.compare-controls select { padding: 0.75rem 1rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 1rem; min-width: 200px; }
.vs { font-size: 1.5rem; font-weight: 700; color: #6b7280; }
.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
.compare-card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }`,
      js: `function updateComparison() { /* fetch both items and render diff highlights */ }
document.getElementById('item-a').addEventListener('change', updateComparison);
document.getElementById('item-b').addEventListener('change', updateComparison);
updateComparison();`,
      promptHint: `Layout: side-by-side-comparison
Required sections (in order): header with title, control row with two dropdowns (Item A selector | VS badge | Item B selector) and a compare/refresh button, two-column comparison cards (equal width, left=A right=B), difference summary row below cards showing which item "wins" each metric with colored badges
UI patterns: metrics that differ between A and B are highlighted (green for better, red for worse), VS badge in center is large and bold, cards have identical structure for easy visual scanning
Must include: at least 6 comparable metrics per item shown as rows (label + value A + value B), winning value highlighted with subtle green background, pre-populated with 4-5 selectable items per dropdown
Avoid: map components, feed lists, masonry grids`,
    };
  }
}
```

- [ ] **Step 5: 타입 체크**

```bash
pnpm type-check
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/templates/InfoLookupTemplate.ts src/templates/MapTemplate.ts src/templates/FeedTemplate.ts src/templates/ComparisonTemplate.ts
git commit -m "feat: InfoLookup, Map, Feed, Comparison 템플릿 추가"
```

---

## Task 6: 신규 템플릿 클래스 4개 (Timeline, NewsCurator, Quiz, Profile)

**Files:**
- Create: `src/templates/TimelineTemplate.ts`
- Create: `src/templates/NewsCuratorTemplate.ts`
- Create: `src/templates/QuizTemplate.ts`
- Create: `src/templates/ProfileTemplate.ts`

- [ ] **Step 1: TimelineTemplate.ts 생성**

파일 `src/templates/TimelineTemplate.ts` 생성:

```typescript
import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class TimelineTemplate implements ICodeTemplate {
  readonly id = 'timeline';
  readonly name = '타임라인/이벤트';
  readonly description = '날짜 기반 데이터를 시간순 타임라인으로 표시';
  readonly category = 'timeline';
  readonly supportedApiCategories = [
    '이벤트', '일정', '역사', '날짜', 'event', 'calendar', 'history', 'schedule', 'timeline',
  ];

  matchScore(apis: ApiCatalogItem[]): number {
    const matching = apis.filter((api) =>
      this.supportedApiCategories.some((cat) =>
        api.category.toLowerCase().includes(cat.toLowerCase()) ||
        api.name.toLowerCase().includes(cat.toLowerCase()) ||
        api.description.toLowerCase().includes(cat.toLowerCase())
      )
    );
    return apis.length > 0 ? matching.length / apis.length : 0;
  }

  generate(_context: TemplateContext): TemplateOutput {
    return {
      html: `<div class="timeline-app">
  <header><h1>타임라인</h1></header>
  <div class="timeline-filters">
    <button class="filter-btn active" data-filter="all">전체</button>
  </div>
  <div class="timeline-container">
    <div class="timeline-line"></div>
    <div class="timeline-items" id="timeline-items"></div>
  </div>
</div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #f8fafc; }
.timeline-app { max-width: 800px; margin: 0 auto; padding: 2rem; }
.timeline-container { position: relative; padding-left: 2rem; }
.timeline-line { position: absolute; left: 0.5rem; top: 0; bottom: 0; width: 2px; background: #e2e8f0; }
.timeline-item { position: relative; padding: 1rem 0 1rem 2rem; }
.timeline-dot { position: absolute; left: -1.75rem; top: 1.25rem; width: 1rem; height: 1rem; border-radius: 50%; background: #3b82f6; border: 2px solid white; box-shadow: 0 0 0 2px #3b82f6; }
.timeline-card { background: white; border-radius: 8px; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.timeline-date { font-size: 0.75rem; color: #6b7280; margin-bottom: 0.25rem; }`,
      js: `const MOCK_EVENTS = [
  { date: '2024-01-15', title: '이벤트 1', category: '기술', description: '설명 내용입니다.' },
  { date: '2024-02-20', title: '이벤트 2', category: '문화', description: '설명 내용입니다.' },
];
function renderTimeline(events) {
  const container = document.getElementById('timeline-items');
  container.innerHTML = events.map(e =>
    \`<div class="timeline-item"><div class="timeline-dot"></div>
    <div class="timeline-card"><div class="timeline-date">\${e.date}</div>
    <h3>\${e.title}</h3><p>\${e.description}</p></div></div>\`
  ).join('');
}
renderTimeline(MOCK_EVENTS);`,
      promptHint: `Layout: vertical-timeline
Required sections (in order): header with title and year-range display, horizontal filter buttons (by category or year), vertical timeline (center line with alternating left-right cards on desktop, all-right on mobile), each event card has date badge + icon + title + description + category tag
UI patterns: timeline dot color matches category color, cards alternate left/right on desktop (lg:flex-row-reverse for odd items), smooth scroll-into-view on filter
Must include: at least 10 mock timeline events spanning at least 2 years, category filter that shows/hides events, date shown as formatted Korean date (e.g., 2024년 1월 15일)
Avoid: map components, chart.js charts, calculator inputs`,
    };
  }
}
```

- [ ] **Step 2: NewsCuratorTemplate.ts 생성**

파일 `src/templates/NewsCuratorTemplate.ts` 생성:

```typescript
import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class NewsCuratorTemplate implements ICodeTemplate {
  readonly id = 'news-curator';
  readonly name = '뉴스 큐레이터';
  readonly description = '여러 소스의 뉴스를 한 페이지에 큐레이팅';
  readonly category = 'news';
  readonly supportedApiCategories = [
    '뉴스', '미디어', '기사', '언론', 'news', 'media', 'article', 'rss', 'headline',
  ];

  matchScore(apis: ApiCatalogItem[]): number {
    const matching = apis.filter((api) =>
      this.supportedApiCategories.some((cat) =>
        api.category.toLowerCase().includes(cat.toLowerCase()) ||
        api.name.toLowerCase().includes(cat.toLowerCase()) ||
        api.description.toLowerCase().includes(cat.toLowerCase())
      )
    );
    return apis.length > 0 ? matching.length / apis.length : 0;
  }

  generate(_context: TemplateContext): TemplateOutput {
    return {
      html: `<div class="news-app">
  <header class="news-header">
    <h1>뉴스 큐레이터</h1>
    <div class="header-controls">
      <input type="text" id="news-search" placeholder="기사 검색..." />
    </div>
  </header>
  <nav class="source-filters" id="source-filters"></nav>
  <main class="news-main">
    <section class="top-story" id="top-story"></section>
    <div class="news-grid" id="news-grid"></div>
    <aside class="tag-cloud" id="tag-cloud"></aside>
  </main>
</div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #f8fafc; }
.news-app { max-width: 1400px; margin: 0 auto; }
.news-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; background: white; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 10; }
.news-main { display: grid; grid-template-columns: 1fr 280px; gap: 2rem; padding: 2rem; }
.top-story { background: white; border-radius: 12px; overflow: hidden; margin-bottom: 1.5rem; }
.news-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
.tag-cloud { background: white; border-radius: 12px; padding: 1.5rem; height: fit-content; }`,
      js: `function renderNews(items) { /* render top story + grid */ }
document.getElementById('news-search').addEventListener('input', (e) => {
  /* filter by search term */
});
renderNews([]);`,
      promptHint: `Layout: news-curator
Required sections (in order): sticky header (logo left, search input right), horizontal source filter pills (All + individual source names), featured top story (full-width hero card with large image + headline + excerpt + source badge), secondary news grid (2-3 columns of smaller cards), tag cloud sidebar (right side on desktop)
UI patterns: top story card is visually dominant (larger image, bigger text), source filter pills change color when active, cards show publication time as relative (e.g., "3시간 전"), tag cloud shows clickable topic tags
Must include: at least 8 mock articles from at least 3 different sources, relative time display for article dates, source logos or color-coded badges
Avoid: timeline layout, map components, calculator inputs`,
    };
  }
}
```

- [ ] **Step 3: QuizTemplate.ts 생성**

파일 `src/templates/QuizTemplate.ts` 생성:

```typescript
import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class QuizTemplate implements ICodeTemplate {
  readonly id = 'quiz';
  readonly name = '퀴즈/인터랙티브';
  readonly description = 'API 데이터 기반 퀴즈 또는 인터랙티브 서비스';
  readonly category = 'interactive';
  readonly supportedApiCategories = [
    '퀴즈', '교육', '학습', '게임', '인터랙티브', 'quiz', 'education', 'learning', 'game', 'trivia',
  ];

  matchScore(apis: ApiCatalogItem[]): number {
    const matching = apis.filter((api) =>
      this.supportedApiCategories.some((cat) =>
        api.category.toLowerCase().includes(cat.toLowerCase()) ||
        api.name.toLowerCase().includes(cat.toLowerCase()) ||
        api.description.toLowerCase().includes(cat.toLowerCase())
      )
    );
    return apis.length > 0 ? matching.length / apis.length : 0;
  }

  generate(_context: TemplateContext): TemplateOutput {
    return {
      html: `<div class="quiz-app">
  <header><h1>퀴즈</h1></header>
  <div class="quiz-progress">
    <div class="progress-bar"><div id="progress-fill" style="width:0%"></div></div>
    <span id="progress-text">0 / 0</span>
  </div>
  <div class="quiz-card" id="quiz-card">
    <div class="question-text" id="question-text">로딩 중...</div>
    <div class="options" id="options"></div>
  </div>
  <div class="quiz-result hidden" id="quiz-result"></div>
</div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.quiz-app { width: 100%; max-width: 640px; padding: 1.5rem; }
.quiz-card { background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
.question-text { font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; line-height: 1.6; }
.options { display: flex; flex-direction: column; gap: 0.75rem; }
.option-btn { padding: 0.875rem 1.25rem; border: 2px solid #e2e8f0; border-radius: 10px; background: white; cursor: pointer; text-align: left; font-size: 1rem; transition: all 0.15s; }
.option-btn:hover { border-color: #667eea; background: #f0f4ff; }
.option-btn.correct { border-color: #10b981; background: #ecfdf5; }
.option-btn.wrong { border-color: #ef4444; background: #fef2f2; }
.progress-bar { height: 6px; background: rgba(255,255,255,0.3); border-radius: 3px; margin-bottom: 0.5rem; overflow: hidden; }
#progress-fill { height: 100%; background: white; border-radius: 3px; transition: width 0.3s; }
#progress-text { color: white; font-size: 0.875rem; }
.quiz-result { background: white; border-radius: 16px; padding: 2rem; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
.hidden { display: none; }`,
      js: `let currentQ = 0; let score = 0;
const QUESTIONS = [
  { q: '예시 질문 1?', options: ['답 A', '답 B', '답 C', '답 D'], correct: 0 },
  { q: '예시 질문 2?', options: ['답 A', '답 B', '답 C', '답 D'], correct: 1 },
];
function renderQuestion() {
  const q = QUESTIONS[currentQ];
  document.getElementById('question-text').textContent = q.q;
  document.getElementById('progress-fill').style.width = \`\${(currentQ / QUESTIONS.length) * 100}%\`;
  document.getElementById('progress-text').textContent = \`\${currentQ + 1} / \${QUESTIONS.length}\`;
  const opts = document.getElementById('options');
  opts.innerHTML = q.options.map((o, i) =>
    \`<button class="option-btn" onclick="answer(\${i})">\${o}</button>\`
  ).join('');
}
function answer(idx) {
  const q = QUESTIONS[currentQ];
  const btns = document.querySelectorAll('.option-btn');
  btns[q.correct].classList.add('correct');
  if (idx !== q.correct) btns[idx].classList.add('wrong');
  if (idx === q.correct) score++;
  setTimeout(() => {
    currentQ++;
    if (currentQ < QUESTIONS.length) renderQuestion();
    else showResult();
  }, 800);
}
function showResult() {
  document.getElementById('quiz-card').classList.add('hidden');
  const r = document.getElementById('quiz-result');
  r.classList.remove('hidden');
  r.innerHTML = \`<h2>결과: \${score}/\${QUESTIONS.length}점</h2><button onclick="location.reload()">다시 하기</button>\`;
}
renderQuestion();`,
      promptHint: `Layout: quiz-interactive
Required sections (in order): centered quiz card (max-width 640px, centered on gradient background), progress bar at top showing current question number, question text (large, prominent), 4 answer option buttons (stacked vertically), result summary screen (shown after last question with score + retry button)
UI patterns: correct answer highlighted green, wrong answer highlighted red (both shown after selection), 800ms delay before advancing to next question, smooth progress bar animation
Must include: at least 10 questions with 4 options each sourced from API data (or realistic mock data), score tracking, final result percentage display, "다시 하기" (retry) button
Avoid: map components, data dashboards, feed layouts`,
    };
  }
}
```

- [ ] **Step 4: ProfileTemplate.ts 생성**

파일 `src/templates/ProfileTemplate.ts` 생성:

```typescript
import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class ProfileTemplate implements ICodeTemplate {
  readonly id = 'profile';
  readonly name = '프로필/포트폴리오';
  readonly description = 'API 데이터 기반 프로필 또는 포트폴리오 카드';
  readonly category = 'profile';
  readonly supportedApiCategories = [
    '프로필', '포트폴리오', '개인', '소개', 'profile', 'portfolio', 'personal', 'bio', 'card',
  ];

  matchScore(apis: ApiCatalogItem[]): number {
    const matching = apis.filter((api) =>
      this.supportedApiCategories.some((cat) =>
        api.category.toLowerCase().includes(cat.toLowerCase()) ||
        api.name.toLowerCase().includes(cat.toLowerCase()) ||
        api.description.toLowerCase().includes(cat.toLowerCase())
      )
    );
    return apis.length > 0 ? matching.length / apis.length : 0;
  }

  generate(_context: TemplateContext): TemplateOutput {
    return {
      html: `<div class="profile-app">
  <div class="profile-hero" id="profile-hero">
    <div class="profile-avatar"></div>
    <h1 id="profile-name">이름</h1>
    <p id="profile-bio">소개</p>
  </div>
  <div class="stats-row" id="stats-row"></div>
  <div class="activity-feed" id="activity-feed"></div>
</div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #f8fafc; }
.profile-app { max-width: 900px; margin: 0 auto; }
.profile-hero { background: linear-gradient(135deg, #1e3a5f, #2563eb); color: white; padding: 3rem 2rem; text-align: center; }
.profile-avatar { width: 96px; height: 96px; border-radius: 50%; background: rgba(255,255,255,0.2); margin: 0 auto 1rem; border: 3px solid rgba(255,255,255,0.5); }
.profile-hero h1 { font-size: 1.875rem; font-weight: 700; }
.profile-hero p { color: rgba(255,255,255,0.8); margin-top: 0.5rem; max-width: 480px; margin-left: auto; margin-right: auto; }
.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); background: white; border-bottom: 1px solid #e2e8f0; }
.stat-item { padding: 1.5rem; text-align: center; border-right: 1px solid #e2e8f0; }
.stat-number { font-size: 1.5rem; font-weight: 700; color: #2563eb; }
.stat-label { font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem; }
.activity-feed { padding: 2rem; }
.activity-item { display: flex; gap: 1rem; padding: 1rem 0; border-bottom: 1px solid #f1f5f9; }`,
      js: `const MOCK_STATS = [
  { number: '128', label: '프로젝트' },
  { number: '4.8', label: '평균 평점' },
  { number: '2.3K', label: '팔로워' },
  { number: '156', label: '기여' },
];
const statsRow = document.getElementById('stats-row');
MOCK_STATS.forEach(s => {
  statsRow.innerHTML += \`<div class="stat-item"><div class="stat-number">\${s.number}</div><div class="stat-label">\${s.label}</div></div>\`;
});`,
      promptHint: `Layout: profile-portfolio
Required sections (in order): hero banner (gradient background with avatar image + name + tagline + social links), stats row (4 metric cards: projects/score/followers/contributions), tabbed content area (탭: 소개 | 작품 | 활동), activity feed (chronological list of recent actions with icon + text + date)
UI patterns: hero gradient is bold and personalized to the subject matter, stats numbers are large and prominent, tab switching shows/hides content sections without page reload
Must include: at least 6 portfolio/activity items in the feed, stats that reflect realistic numbers for the domain, avatar with appropriate fallback initials if no image
Avoid: quiz interactions, map components, news feed with external links`,
    };
  }
}
```

- [ ] **Step 5: 타입 체크**

```bash
pnpm type-check
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/templates/TimelineTemplate.ts src/templates/NewsCuratorTemplate.ts src/templates/QuizTemplate.ts src/templates/ProfileTemplate.ts
git commit -m "feat: Timeline, NewsCurator, Quiz, Profile 템플릿 추가"
```

---

## Task 7: TemplateRegistry — 11개 전체 등록

**Files:**
- Modify: `src/templates/TemplateRegistry.ts`

- [ ] **Step 1: TemplateRegistry.ts 전체 교체**

`src/templates/TemplateRegistry.ts`를 다음 내용으로 교체한다:

```typescript
import type { ICodeTemplate } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';
import { DashboardTemplate } from './DashboardTemplate';
import { CalculatorTemplate } from './CalculatorTemplate';
import { GalleryTemplate } from './GalleryTemplate';
import { InfoLookupTemplate } from './InfoLookupTemplate';
import { MapTemplate } from './MapTemplate';
import { FeedTemplate } from './FeedTemplate';
import { ComparisonTemplate } from './ComparisonTemplate';
import { TimelineTemplate } from './TimelineTemplate';
import { NewsCuratorTemplate } from './NewsCuratorTemplate';
import { QuizTemplate } from './QuizTemplate';
import { ProfileTemplate } from './ProfileTemplate';

class TemplateRegistryImpl {
  private templates = new Map<string, ICodeTemplate>();

  constructor() {
    this.register(new DashboardTemplate());
    this.register(new CalculatorTemplate());
    this.register(new GalleryTemplate());
    this.register(new InfoLookupTemplate());
    this.register(new MapTemplate());
    this.register(new FeedTemplate());
    this.register(new ComparisonTemplate());
    this.register(new TimelineTemplate());
    this.register(new NewsCuratorTemplate());
    this.register(new QuizTemplate());
    this.register(new ProfileTemplate());
  }

  register(template: ICodeTemplate): void {
    this.templates.set(template.id, template);
  }

  unregister(id: string): void {
    this.templates.delete(id);
  }

  get(id: string): ICodeTemplate | undefined {
    return this.templates.get(id);
  }

  getAll(): ICodeTemplate[] {
    return Array.from(this.templates.values());
  }

  /** API 조합에 가장 적합한 템플릿 반환 (임계값 이상만) */
  findBestMatch(apis: ApiCatalogItem[], threshold = 0.3): ICodeTemplate | null {
    let bestTemplate: ICodeTemplate | null = null;
    let bestScore = 0;

    for (const template of this.templates.values()) {
      const score = template.matchScore(apis);
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestTemplate = template;
      }
    }

    return bestTemplate;
  }
}

export const templateRegistry = new TemplateRegistryImpl();
```

- [ ] **Step 2: 타입 체크 및 테스트**

```bash
pnpm type-check && pnpm test
```

Expected: 에러 없음, 전체 테스트 PASS

- [ ] **Step 3: 커밋**

```bash
git add src/templates/TemplateRegistry.ts
git commit -m "feat: TemplateRegistry에 11개 템플릿 전체 등록"
```

---

## Task 8: TemplateSelector UI — 신규 5개 버튼 추가

**Files:**
- Modify: `src/components/builder/TemplateSelector.tsx`

- [ ] **Step 1: TemplateSelector.tsx의 TEMPLATES 배열에 5개 추가**

`src/components/builder/TemplateSelector.tsx`의 `TEMPLATES` 배열을 다음으로 교체한다:

```typescript
const TEMPLATES: Template[] = [
  {
    id: 'dashboard',
    label: '대시보드',
    text: '데이터를 시각화하는 대시보드를 만들어주세요. 주요 지표를 카드로 표시하고, 차트와 그래프로 데이터 트렌드를 보여줍니다. 실시간 업데이트가 가능한 깔끔한 UI로 구성합니다.',
  },
  {
    id: 'calculator',
    label: '계산기/변환기',
    text: '사용자가 값을 입력하면 실시간으로 계산하거나 변환해주는 도구를 만들어주세요. 입력 필드와 결과 표시 영역을 명확히 분리하고, 변환 히스토리를 제공합니다.',
  },
  {
    id: 'info-lookup',
    label: '정보 조회',
    text: '검색어를 입력하면 관련 정보를 조회하여 보여주는 서비스를 만들어주세요. 검색 결과를 카드 형태로 표시하고, 필터와 정렬 기능을 제공합니다.',
  },
  {
    id: 'gallery',
    label: '갤러리',
    text: '이미지나 콘텐츠를 그리드 형태로 보여주는 갤러리 서비스를 만들어주세요. 카테고리 필터, 무한 스크롤, 상세 보기 모달을 제공합니다.',
  },
  {
    id: 'map',
    label: '지도 서비스',
    text: '위치 기반 정보를 지도 위에 표시하는 서비스를 만들어주세요. Leaflet 지도를 사용하고, 마커 클릭 시 상세 정보를 팝업으로 보여줍니다.',
  },
  {
    id: 'feed',
    label: '콘텐츠 피드',
    text: '뉴스나 게시글을 스크롤 기반 피드로 보여주는 서비스를 만들어주세요. 카테고리별 탭, 검색, 각 항목은 카드 형태로 표시합니다.',
  },
  {
    id: 'comparison',
    label: '실시간 비교',
    text: '두 가지 항목을 나란히 비교하는 서비스를 만들어주세요. 각 항목의 주요 지표를 나란히 보여주고, 차이점을 시각적으로 강조합니다.',
  },
  {
    id: 'timeline',
    label: '타임라인/이벤트',
    text: '날짜 기반 데이터를 시간순으로 보여주는 타임라인 서비스를 만들어주세요. 이벤트를 시간 축 위에 표시하고, 카테고리 필터를 제공합니다.',
  },
  {
    id: 'news-curator',
    label: '뉴스 큐레이터',
    text: '여러 소스의 뉴스를 한 페이지에 모아 보여주는 서비스를 만들어주세요. 소스별 필터, 헤드라인 중심의 레이아웃, 태그 클라우드를 포함합니다.',
  },
  {
    id: 'quiz',
    label: '퀴즈/인터랙티브',
    text: 'API 데이터를 활용한 퀴즈나 인터랙티브 서비스를 만들어주세요. 진행바, 정답/오답 피드백, 최종 결과 화면을 포함합니다.',
  },
  {
    id: 'profile',
    label: '프로필/포트폴리오',
    text: 'API 데이터를 활용한 프로필이나 포트폴리오 페이지를 만들어주세요. 히어로 배너, 주요 통계 카드, 활동 피드 형태로 구성합니다.',
  },
];
```

- [ ] **Step 2: 개발 서버에서 빌더 UI 확인**

```bash
pnpm dev
```

브라우저에서 `http://localhost:3000/builder`로 이동하여 Step 2에서 11개 템플릿 버튼이 모두 표시되는지 확인한다.

- [ ] **Step 3: 전체 테스트 통과 확인**

```bash
pnpm test
```

Expected: 전체 PASS (최소 288개)

- [ ] **Step 4: 커밋**

```bash
git add src/components/builder/TemplateSelector.tsx
git commit -m "feat: TemplateSelector에 신규 5개 템플릿 버튼 추가 (총 11개)"
```

---

## 최종 검증

- [ ] **전체 테스트 + 타입 체크 + 빌드**

```bash
pnpm test && pnpm type-check && pnpm build
```

Expected:
- 전체 테스트 PASS (288개 이상)
- TypeScript 에러 없음
- 빌드 성공

- [ ] **기능 검증**

1. `http://localhost:3000/builder` 접속
2. API 선택 (Step 1)
3. Step 2에서 '대시보드' 템플릿 선택 → context 필드에 텍스트 삽입 확인
4. 생성 시작 → 브라우저 Network 탭에서 generate 요청 body에 `"templateId":"dashboard"` 포함 확인

- [ ] **최종 커밋 및 푸시**

```bash
git push origin main
```
