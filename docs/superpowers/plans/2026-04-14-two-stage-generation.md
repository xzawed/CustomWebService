# 2단계 생성 파이프라인 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 코드 생성을 구조·기능(Stage 1)과 디자인·폴리시(Stage 2)의 두 번의 AI 호출로 분리하여 최종 생성 품질을 향상한다.

**Architecture:** `generationPipeline.ts` 내부에 `runStage1()`, `runStage2()` 함수를 추가하고 `runGenerationPipeline()`이 두 단계를 순서대로 오케스트레이션한다. `PipelineInput` 인터페이스는 `stage1SystemPrompt`, `stage1UserPrompt`, `stage2SystemPrompt`, `buildStage2UserPrompt` 콜백으로 교체된다. Stage 1 결과물은 DB에 저장하지 않으며 Stage 2에만 QC·저장이 적용된다.

**Tech Stack:** TypeScript strict, Vitest, Anthropic SDK (claude-sonnet-4-6), Next.js App Router SSE

---

## 파일 구조

| 파일 | 변경 종류 | 내용 |
|------|-----------|------|
| `src/lib/ai/promptBuilder.ts` | 수정 | 기존 함수 rename + Stage 2 전용 함수 추가 |
| `src/lib/ai/generationPipeline.ts` | 수정 | PipelineInput 교체, runStage1/runStage2 추가, 오케스트레이션 변경 |
| `src/app/api/v1/generate/route.ts` | 수정 | 새 프롬프트 함수 사용, PipelineInput 필드 교체 |
| `src/app/api/v1/generate/regenerate/route.ts` | 수정 | 동일 |
| `src/__tests__/lib/ai/promptBuilder.test.ts` | 신규 | stage1/stage2 프롬프트 내용 검증 |
| `src/__tests__/lib/ai/generationPipeline.test.ts` | 신규 | 2단계 호출 순서, SSE 이벤트 검증 |

---

## Task 1: promptBuilder.ts — Stage 프롬프트 함수 추가

**Files:**
- Modify: `src/lib/ai/promptBuilder.ts`
- Create: `src/__tests__/lib/ai/promptBuilder.test.ts`

### 배경

현재 `promptBuilder.ts`는 다음 함수를 export한다:
- `buildSystemPrompt(templateHint?)` — 사용처: `generate/route.ts:66`
- `buildUserPrompt(apis, context, projectId?, designPreferences?)` — 사용처: `generate/route.ts:68`
- `buildRegenerationPrompt(previousCode, feedback, apis?)` — 사용처: `regenerate/route.ts:76`

이 Task에서는 Stage 1·2 전용 함수를 추가하고 기존 함수를 rename한다 (Task 3·4에서 라우트를 업데이트한다).

---

- [ ] **Step 1: 테스트 파일 작성 (실패 확인용)**

`src/__tests__/lib/ai/promptBuilder.test.ts` 파일을 생성한다:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildStage1SystemPrompt,
  buildStage2SystemPrompt,
  buildStage1UserPrompt,
  buildStage1RegenerationUserPrompt,
  buildStage2UserPrompt,
  buildStage2RegenerationUserPrompt,
} from '@/lib/ai/promptBuilder';
import type { ApiCatalogItem } from '@/types/api';

const mockApi: ApiCatalogItem = {
  id: 'api-1',
  name: '뉴스 API',
  category: '뉴스',
  baseUrl: 'https://api.example.com',
  authType: 'none',
  rateLimit: null,
  endpoints: [],
};

describe('buildStage1SystemPrompt', () => {
  it('목 데이터 및 레이아웃 규칙을 포함한다', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).toContain('grid grid-cols-1');
    expect(prompt).toContain('목 데이터');
  });

  it('디자인 시스템 색상 테마를 포함하지 않는다', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).not.toContain('모던 다크');
    expect(prompt).not.toContain('bg-gray-950 text-gray-100');
  });

  it('@keyframes 애니메이션 지시를 포함하지 않는다', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).not.toContain('@keyframes fadeInUp');
  });

  it('토스트 알림 지시를 포함하지 않는다', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).not.toContain('showToast');
  });

  it('templateHint를 전달하면 프롬프트에 포함된다', () => {
    const prompt = buildStage1SystemPrompt('대시보드 레이아웃');
    expect(prompt).toContain('대시보드 레이아웃');
  });
});

describe('buildStage2SystemPrompt', () => {
  it('디자인 시스템 테마를 포함한다', () => {
    const prompt = buildStage2SystemPrompt();
    expect(prompt).toContain('모던 다크');
    expect(prompt).toContain('클린 라이트');
  });

  it('@keyframes 애니메이션 필수 지시를 포함한다', () => {
    const prompt = buildStage2SystemPrompt();
    expect(prompt).toContain('@keyframes fadeInUp');
  });

  it('showToast 필수 지시를 포함한다', () => {
    const prompt = buildStage2SystemPrompt();
    expect(prompt).toContain('showToast');
  });

  it('기능 변경 금지 규칙을 포함한다', () => {
    const prompt = buildStage2SystemPrompt();
    expect(prompt).toContain('기능과 목 데이터는');
  });

  it('스켈레톤 UI 패턴을 포함한다', () => {
    const prompt = buildStage2SystemPrompt();
    expect(prompt).toContain('animate-pulse');
  });
});

describe('buildStage2UserPrompt', () => {
  it('stage1 HTML·CSS·JS를 포함한다', () => {
    const stage1Code = { html: '<div>구조</div>', css: 'body { margin: 0; }', js: 'const x = 1;' };
    const prompt = buildStage2UserPrompt(stage1Code);
    expect(prompt).toContain('<div>구조</div>');
    expect(prompt).toContain('body { margin: 0; }');
    expect(prompt).toContain('const x = 1;');
  });
});

describe('buildStage2RegenerationUserPrompt', () => {
  it('stage1 코드와 피드백을 포함한다', () => {
    const stage1Code = { html: '<div>수정됨</div>', css: '', js: '' };
    const prompt = buildStage2RegenerationUserPrompt(stage1Code, '파란색 테마로 변경');
    expect(prompt).toContain('<div>수정됨</div>');
    expect(prompt).toContain('파란색 테마로 변경');
  });
});

describe('buildStage1UserPrompt', () => {
  it('API 목록과 context를 포함한다', () => {
    const prompt = buildStage1UserPrompt([mockApi], '뉴스 서비스');
    expect(prompt).toContain('뉴스 API');
    expect(prompt).toContain('뉴스 서비스');
  });
});

describe('buildStage1RegenerationUserPrompt', () => {
  it('이전 코드와 피드백을 포함한다', () => {
    const previousCode = { html: '<div>이전</div>', css: '', js: '' };
    const prompt = buildStage1RegenerationUserPrompt(previousCode, '레이아웃 변경', [mockApi]);
    expect(prompt).toContain('<div>이전</div>');
    expect(prompt).toContain('레이아웃 변경');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test src/__tests__/lib/ai/promptBuilder.test.ts
```

Expected: 모든 테스트 FAIL (함수가 아직 없음)

- [ ] **Step 3: 기존 함수 rename + Stage 1 시스템 프롬프트 정리**

`src/lib/ai/promptBuilder.ts`에서 다음 변경을 적용한다:

**3-1. 캐시 변수 및 buildSystemPrompt 함수 rename:**

```typescript
// 기존:
let cachedSystemPrompt: string | null = null;

export function buildSystemPrompt(templateHint?: string): string {
  const base = cachedSystemPrompt ?? (cachedSystemPrompt = _buildSystemPrompt());
  ...
}

// 변경 후:
let cachedStage1SystemPrompt: string | null = null;

export function buildStage1SystemPrompt(templateHint?: string): string {
  const base = cachedStage1SystemPrompt ?? (cachedStage1SystemPrompt = _buildStage1SystemPrompt());
  if (!templateHint) return base;
  const safeHint = templateHint.slice(0, 2000);
  return `${base}\n\n[템플릿 가이던스]\n${safeHint}\n위의 레이아웃 구조를 반드시 따르세요. 위에 명시된 섹션 구성과 UI 패턴은 필수 사항입니다. 이 구조 안에서 콘텐츠와 API 통합 내용을 채워주세요.`;
}
```

**3-2. `_buildSystemPrompt` → `_buildStage1SystemPrompt` rename 후 다음 섹션들을 제거한다:**

제거 대상 1 — `## 디자인 시스템 선택 (서비스에 맞게 1개 선택)` 전체 블록 (### 1. 모던 다크 ~ ### 8. 모노크롬 끝까지):
```
## 디자인 시스템 선택 (서비스에 맞게 1개 선택)

### 1. 모던 다크 (금융, 개발자, 모니터링, 게임)
...
### 8. 모노크롬 (포트폴리오, 미니멀, 갤러리, 사진)
...
특징: 여백 강조, 타이포그래피 중심, 흑백 + 단일 포인트 컬러
```

제거 대상 2 — `## 페이지 진입 애니메이션 (★ 필수 — 모든 페이지에 적용)` 전체 블록:
```
## 페이지 진입 애니메이션 (★ 필수 — 모든 페이지에 적용)

페이지를 열면 콘텐츠가 아래에서 위로 부드럽게 나타나야 한다. CSS에 반드시 포함하라:
...
```

제거 대상 3 — `## 마이크로 인터랙션 (필수 적용)` 섹션 내 두 하위 섹션:
```
### 버튼 로딩 상태 (비동기 액션 필수)
\`\`\`javascript
function setButtonLoading(btn, loading) {
...
\`\`\`

### 리플 효과 (중요 버튼에 적용)
\`\`\`css
.ripple-btn { position: relative; overflow: hidden; }
...
\`\`\`
\`\`\`javascript
document.querySelectorAll('.ripple-btn').forEach(btn => {
...
});
\`\`\`
```

제거 대상 4 — `### 토스트 알림 (★ 필수 — 모든 API 호출에 반드시 사용)` 전체 블록:
```
### 토스트 알림 (★ 필수 — 모든 API 호출에 반드시 사용)
...
// ★ 반드시 이렇게 API 호출과 연결하라:
```

제거 대상 5 — `## 로딩 / 에러 / 빈 결과 상태 처리` 내에서:
- `### 페이지 초기 로딩 — 스켈레톤 UI (★ 필수)` 전체 블록 제거
- `### 빈 상태 UI (Empty State) — 상황별 필수 패턴` 전체 블록 제거
- `### API 실패 시` 블록에서 `showToast(...)` 호출 줄만 제거, 나머지 banner 코드는 유지

제거 대상 6 — `### 인터랙션 & UX` 체크리스트에서 다음 5줄 제거:
```
□ 페이지 진입 시 fadeInUp 애니메이션이 적용되어 있는가? (animate-fade-in-up)
□ 스켈레톤 UI가 초기 로딩에 표시되는가? (DOMContentLoaded → 300ms → 실제 데이터)
□ API 성공/실패 시 반드시 showToast()가 호출되는가?
□ 빈 결과/에러 상태에 아이콘+메시지+액션버튼이 있는 Empty State UI가 있는가?
□ 비동기 버튼 클릭 시 로딩 스피너(setButtonLoading)가 표시되는가?
```

제거 대상 7 — `## 절대 금지` 마지막 6줄 제거:
```
- 페이지 진입 애니메이션 없음 (모든 요소가 한 번에 확 나타남)
- 스켈레톤 없이 빈 컨테이너가 바로 채워짐 (DOMContentLoaded 즉시 데이터 노출)
- API 호출 결과(성공/실패)에 아무 피드백 없음 (토스트, 배너 등 사용자 알림 필수)
- 빈 결과/에러 상태에 단순 텍스트만 — 아이콘과 액션 버튼 없는 Empty State
- 비동기 액션 버튼에 로딩 표시 없음 (클릭 후 응답 없는 버튼처럼 보임)
- CSS에 @keyframes 없음 (transition만으로는 진입 애니메이션 불가)
```

**3-3. `_buildStage1SystemPrompt()` 반환값 마지막 backtick 앞에 Stage 1 범위 안내를 추가한다:**

`- 콘텐츠와 무관한 이미지 (커피숍에 산 사진, 날씨에 인물 사진 등)\``;` 직전에 삽입:

```typescript
\n\n## [1단계 범위 안내]\n이 단계는 구조·레이아웃·기능·목 데이터에만 집중합니다.\n다음 항목은 2단계(디자인 강화)에서 자동 적용됩니다:\n- 디자인 시스템 (색상 테마, 글래스모피즘)\n- 페이지 진입 애니메이션 (@keyframes)\n- 스켈레톤 UI 로딩 패턴\n- 토스트 알림\n- 버튼 로딩 상태·리플 효과\n- Empty State UI (아이콘·액션 버튼 포함)\n\n지금은 기본 Tailwind 유틸리티(bg-white, text-gray-900 등)로 구조만 완성하세요.
```

- [ ] **Step 4: Stage 2 시스템 프롬프트 추가**

`promptBuilder.ts` 파일 끝의 `buildRegenerationPrompt` 함수 아래에 추가한다:

```typescript
// Stage 2 시스템 프롬프트 캐시
let cachedStage2SystemPrompt: string | null = null;

export function buildStage2SystemPrompt(): string {
  return cachedStage2SystemPrompt ?? (cachedStage2SystemPrompt = _buildStage2SystemPrompt());
}

function _buildStage2SystemPrompt(): string {
  return `당신은 완성된 웹서비스 구조 코드에 시각적 완성도를 입히는 UI/UX 전문가입니다.

## 핵심 규칙 (위반 시 실패)

1. **기능과 목 데이터는 절대 변경하지 말 것.** JavaScript 로직, API 호출, 목 데이터 배열, 이벤트 핸들러는 그대로 유지.
2. **HTML 시맨틱 구조는 유지.** 섹션 재설계 금지 — CSS 클래스 추가·변경만 허용.
3. **전체 코드를 HTML / CSS / JavaScript 형식으로 반환.**
4. **모든 텍스트는 한국어 유지.**

## 디자인 시스템 선택 (서비스에 맞게 1개 선택, 전면 적용)

### 1. 모던 다크 (금융, 개발자, 모니터링, 게임)
body: \`bg-gray-950 text-gray-100\`
카드: \`bg-gray-900 border border-gray-800 hover:border-gray-700\`
액센트: \`text-blue-400 bg-blue-500/10\`
헤더: \`bg-gray-950/80 border-gray-800\`

### 2. 클린 라이트 (뉴스, 쇼핑, 일반, 교육)
body: \`bg-gray-50 text-gray-900\`
카드: \`bg-white shadow-sm hover:shadow-lg\`
액센트: \`text-blue-600 bg-blue-50\`
헤더: \`bg-white/80 border-gray-200\`

### 3. 따뜻한 톤 (음식, 여행, 라이프스타일, 카페)
body: \`bg-orange-50/30 text-gray-900\`
카드: \`bg-white shadow-sm hover:shadow-lg\`
액센트: \`text-orange-600 bg-orange-50\`
헤더: \`bg-orange-50/80 border-orange-100\`

### 4. 오션 블루 (날씨, 여행, 물류, 교통)
body: \`bg-slate-50 text-slate-900\`
카드: \`bg-white shadow-sm border border-sky-100 hover:shadow-lg\`
액센트: \`text-sky-600 bg-sky-50\`
헤더: \`bg-white/80 border-sky-100\`

### 5. 포레스트 그린 (건강, 환경, 교육, 웰빙)
body: \`bg-emerald-50/20 text-gray-900\`
카드: \`bg-white shadow-sm hover:shadow-lg\`
액센트: \`text-emerald-600 bg-emerald-50\`
헤더: \`bg-white/80 border-emerald-100\`

### 6. 선셋 그래디언트 (엔터테인먼트, 음악, 이벤트, SNS)
body: \`bg-gradient-to-br from-purple-950 via-indigo-950 to-slate-950 text-gray-100\`
카드: \`bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20\`
액센트: \`text-purple-400 bg-purple-500/10\`
헤더: \`bg-black/20 backdrop-blur-xl border-white/10\`

### 7. 파스텔 (반려동물, 키즈, 커뮤니티, 취미)
body: \`bg-pink-50/20 text-gray-800\`
카드: \`bg-white shadow-sm rounded-3xl hover:shadow-lg\`
액센트: \`text-rose-500 bg-rose-50\`
헤더: \`bg-white/80 border-pink-100\`

### 8. 모노크롬 (포트폴리오, 미니멀, 갤러리, 사진)
body: \`bg-white text-gray-900\`
카드: \`bg-gray-50 border border-gray-100 hover:border-gray-300\`
액센트: \`text-gray-900 bg-gray-100\`
헤더: \`bg-white border-gray-100\`

## 페이지 진입 애니메이션 (★ 필수 — CSS에 반드시 포함)

\`\`\`css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
.animate-fade-in-up { animation: fadeInUp 0.5s ease-out both; }
.animate-fade-in    { animation: fadeIn 0.4s ease-out both; }
.animate-slide-in   { animation: slideInRight 0.4s ease-out both; }
.delay-100 { animation-delay: 0.1s; }
.delay-200 { animation-delay: 0.2s; }
.delay-300 { animation-delay: 0.3s; }
.delay-400 { animation-delay: 0.4s; }
.delay-500 { animation-delay: 0.5s; }
\`\`\`

적용: 헤더 \`animate-fade-in\`, 통계 카드 \`animate-fade-in-up delay-100~400\`, 메인 섹션 \`animate-fade-in-up delay-200\`.

## 마이크로 인터랙션 강화 (★ 필수)

기존 hover/transition은 유지하고 다음을 추가하라:

### 버튼 로딩 상태
\`\`\`javascript
function setButtonLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = \\\`<svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>처리 중...\\\`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText;
  }
}
\`\`\`

### 리플 효과
\`\`\`css
.ripple-btn { position: relative; overflow: hidden; }
.ripple-btn .ripple {
  position: absolute; border-radius: 50%;
  background: rgba(255,255,255,0.35);
  transform: scale(0);
  animation: ripple-anim 0.5s linear;
  pointer-events: none;
}
@keyframes ripple-anim { to { transform: scale(4); opacity: 0; } }
\`\`\`
\`\`\`javascript
document.querySelectorAll('.ripple-btn').forEach(btn => {
  btn.addEventListener('click', function(e) {
    const r = document.createElement('span');
    r.className = 'ripple';
    const rect = this.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    r.style.cssText = \\\`width:\\\${size}px;height:\\\${size}px;left:\\\${e.clientX-rect.left-size/2}px;top:\\\${e.clientY-rect.top-size/2}px\\\`;
    this.appendChild(r);
    setTimeout(() => r.remove(), 500);
  });
});
\`\`\`

## 스켈레톤 UI (★ 필수 — 초기 로딩에 적용)

DOMContentLoaded 직후 300ms 동안 스켈레톤을 먼저 표시하라:

\`\`\`javascript
document.addEventListener('DOMContentLoaded', () => {
  renderSkeletons(8);
  setTimeout(() => {
    renderCards(mockData);
    fetchApiData();
  }, 300);
});
\`\`\`

카드 스켈레톤 HTML:
\`\`\`html
<div class="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse">
  <div class="aspect-video bg-gray-200"></div>
  <div class="p-5 space-y-3">
    <div class="h-4 bg-gray-200 rounded-full w-3/4"></div>
    <div class="h-3 bg-gray-200 rounded-full w-full"></div>
    <div class="h-3 bg-gray-200 rounded-full w-2/3"></div>
  </div>
</div>
\`\`\`

## 토스트 알림 (★ 필수 — 모든 API 호출에 반드시 사용)

\`\`\`javascript
function showToast(message, type = 'success') {
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  const colors = { success: 'bg-emerald-500', error: 'bg-red-500', info: 'bg-blue-500', warning: 'bg-amber-500' };
  const toast = document.createElement('div');
  toast.className = \\\`fixed bottom-6 right-6 \\\${colors[type]} text-white px-5 py-3 rounded-xl shadow-2xl z-[100] flex items-center gap-3 transform translate-y-4 opacity-0 transition-all duration-300 max-w-sm\\\`;
  toast.innerHTML = \\\`<i class="fas \\\${icons[type]} text-lg shrink-0"></i><span class="text-sm font-medium">\\\${message}</span>\\\`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.classList.remove('translate-y-4', 'opacity-0'); });
  setTimeout(() => { toast.classList.add('translate-y-4', 'opacity-0'); setTimeout(() => toast.remove(), 300); }, 3500);
}
// API 성공: showToast('데이터를 불러왔습니다.', 'success')
// API 실패: showToast('데이터 로딩에 실패했습니다.', 'error')
\`\`\`

## Empty State UI (★ 필수 — 빈 결과/에러 시 반드시 표시)

검색 0건:
\`\`\`html
<div class="flex flex-col items-center justify-center py-20 text-center">
  <div class="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
    <i class="fas fa-search text-3xl text-gray-400"></i>
  </div>
  <h3 class="text-lg font-semibold text-gray-700 mb-2">결과가 없습니다</h3>
  <p class="text-sm text-gray-400 mb-6">다른 키워드로 검색해보세요</p>
  <button onclick="clearSearch()" class="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 transition-colors">검색 초기화</button>
</div>
\`\`\`

에러 상태:
\`\`\`html
<div class="flex flex-col items-center justify-center py-20 text-center">
  <div class="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
    <i class="fas fa-exclamation-triangle text-3xl text-red-400"></i>
  </div>
  <h3 class="text-lg font-semibold text-gray-700 mb-2">데이터를 불러오지 못했습니다</h3>
  <p class="text-sm text-gray-400 mb-6">잠시 후 다시 시도해주세요</p>
  <button onclick="location.reload()" class="px-5 py-2 bg-red-500 text-white rounded-xl text-sm hover:bg-red-600 transition-colors"><i class="fas fa-redo mr-2"></i>새로고침</button>
</div>
\`\`\`

## 2단계 품질 체크리스트

반환 전 확인:
□ 선택한 디자인 시스템이 전체에 일관되게 적용되었는가?
□ CSS에 @keyframes fadeInUp / fadeIn 이 포함되어 있는가?
□ 헤더·카드·섹션에 animate-fade-in-up 클래스가 적용되어 있는가?
□ DOMContentLoaded 시 스켈레톤이 먼저 표시되는가?
□ API 성공/실패에 showToast()가 호출되는가?
□ 빈 결과·에러 상태에 아이콘+버튼이 있는 Empty State가 있는가?
□ 중요 버튼에 ripple-btn 클래스가 적용되어 있는가?
□ 비동기 버튼에 setButtonLoading()이 사용되는가?

## 절대 금지

- JavaScript 로직·이벤트 핸들러 변경
- 목 데이터 배열 수정
- 기존 기능 제거
- HTML 섹션 재설계
- @keyframes 없는 CSS 반환
- API 호출 후 showToast() 미호출
- Empty State 없는 빈 결과 화면`;
}
```

- [ ] **Step 5: buildStage1UserPrompt, buildStage1RegenerationUserPrompt, buildStage2UserPrompt, buildStage2RegenerationUserPrompt 추가**

`promptBuilder.ts`에서:

```typescript
// 기존 함수 rename:
// export function buildUserPrompt → export function buildStage1UserPrompt
// export function buildRegenerationPrompt → export function buildStage1RegenerationUserPrompt

// 새 함수 추가 (buildStage2SystemPrompt 아래에):
export function buildStage2UserPrompt(stage1Code: {
  html: string;
  css: string;
  js: string;
}): string {
  return `다음은 1단계에서 생성된 구조 코드입니다.
기능과 목 데이터는 완성되어 있으므로 수정하지 마세요.
디자인 시스템, 애니메이션, 마이크로 인터랙션을 강화하여 전체 코드를 반환하세요.

### HTML (1단계)
\`\`\`html
${stage1Code.html}
\`\`\`

### CSS (1단계)
\`\`\`css
${stage1Code.css}
\`\`\`

### JavaScript (1단계)
\`\`\`javascript
${stage1Code.js}
\`\`\`

다음 형식으로 전체 코드를 반환하세요:

### HTML
\`\`\`html
(완전한 HTML 코드)
\`\`\`

### CSS
\`\`\`css
(디자인 강화된 CSS — @keyframes, 스켈레톤, 리플 포함)
\`\`\`

### JavaScript
\`\`\`javascript
(기존 기능 그대로, showToast/setButtonLoading/ripple 핸들러 추가)
\`\`\``;
}

export function buildStage2RegenerationUserPrompt(
  stage1Code: { html: string; css: string; js: string },
  feedback: string,
): string {
  return `다음은 1단계에서 피드백을 반영하여 구조가 수정된 코드입니다.
기능을 유지하면서 디자인 시스템, 애니메이션, 마이크로 인터랙션을 강화하세요.
피드백(${JSON.stringify(feedback)})도 디자인 관점에서 추가로 반영하세요.

### HTML (1단계)
\`\`\`html
${stage1Code.html}
\`\`\`

### CSS (1단계)
\`\`\`css
${stage1Code.css}
\`\`\`

### JavaScript (1단계)
\`\`\`javascript
${stage1Code.js}
\`\`\`

다음 형식으로 전체 코드를 반환하세요:

### HTML
\`\`\`html
(완전한 HTML 코드)
\`\`\`

### CSS
\`\`\`css
(디자인 강화된 CSS)
\`\`\`

### JavaScript
\`\`\`javascript
(기존 기능 그대로, 시각 폴리시 함수 추가)
\`\`\``;
}
```

- [ ] **Step 6: 테스트 실행 — 통과 확인**

```bash
pnpm test src/__tests__/lib/ai/promptBuilder.test.ts
```

Expected: 모든 테스트 PASS

- [ ] **Step 7: 타입 체크**

```bash
pnpm type-check
```

Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add src/lib/ai/promptBuilder.ts src/__tests__/lib/ai/promptBuilder.test.ts
git commit -m "feat: Stage 1/2 분리 프롬프트 함수 추가 (promptBuilder)"
```

---

## Task 2: generationPipeline.ts — 2단계 파이프라인 구현

**Files:**
- Modify: `src/lib/ai/generationPipeline.ts`
- Create: `src/__tests__/lib/ai/generationPipeline.test.ts`

### 배경

현재 `PipelineInput`의 `systemPrompt`, `userPrompt`, `streamingLabel` 필드를 Stage별 필드로 교체하고, `runStage1()`, `runStage2()` 내부 함수를 추가하여 `runGenerationPipeline()`이 두 단계를 순서대로 실행하게 한다.

---

- [ ] **Step 1: 테스트 파일 작성**

`src/__tests__/lib/ai/generationPipeline.test.ts` 파일을 생성한다:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { runGenerationPipeline, type PipelineInput, type PipelineServices } from '@/lib/ai/generationPipeline';
import type { SseWriter } from '@/lib/ai/sseWriter';

vi.mock('@/providers/ai/AiProviderFactory', () => ({
  AiProviderFactory: { createForTask: vi.fn() },
}));
vi.mock('@/lib/ai/codeParser', () => ({
  parseGeneratedCode: vi.fn((_c: string) => ({ html: '<div>test</div>', css: 'body{}', js: 'var x=1;' })),
  assembleHtml: vi.fn(() => '<html><body><div>test</div></body></html>'),
}));
vi.mock('@/lib/ai/codeValidator', () => ({
  validateAll: vi.fn(() => ({ passed: true, errors: [], warnings: [] })),
  evaluateQuality: vi.fn(() => ({ structuralScore: 80, mobileScore: 80 })),
}));
vi.mock('@/lib/ai/qualityLoop', () => ({
  shouldRetryGeneration: vi.fn(() => false),
  buildQualityImprovementPrompt: vi.fn(() => 'improve'),
}));
vi.mock('@/lib/ai/categoryDesignMap', () => ({
  inferDesignFromCategories: vi.fn(() => ({ theme: 'light', layout: 'grid', allowedSections: [] })),
}));
vi.mock('@/lib/qc', () => ({
  isQcEnabled: vi.fn(() => false),
  runFastQc: vi.fn(),
  runDeepQc: vi.fn(),
}));
vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));
vi.mock('@/lib/config/features', () => ({
  getLimits: vi.fn(() => ({ maxCodeVersionsPerProject: 5 })),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(() => Promise.resolve({})),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const makeAiProvider = () => ({
  name: 'claude',
  generateCodeStream: vi.fn().mockResolvedValue({
    content: '<div>generated</div>',
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    durationMs: 1000,
    tokensUsed: { inputTokens: 100, outputTokens: 200 },
  }),
  generateCode: vi.fn().mockResolvedValue({
    content: '<div>improved</div>',
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    durationMs: 500,
    tokensUsed: { inputTokens: 50, outputTokens: 100 },
  }),
});

const makeSse = (): SseWriter => ({
  send: vi.fn(),
  isCancelled: vi.fn(() => false),
});

const makeServices = (): PipelineServices => ({
  codeRepo: {
    create: vi.fn().mockResolvedValue({ id: 'code-1' }),
    pruneOldVersions: vi.fn().mockResolvedValue(undefined),
    getNextVersion: vi.fn().mockResolvedValue(1),
    delete: vi.fn().mockResolvedValue(undefined),
    findByProject: vi.fn().mockResolvedValue(null),
  } as unknown as PipelineServices['codeRepo'],
  eventRepo: { persistAsync: vi.fn() } as unknown as PipelineServices['eventRepo'],
  projectService: { updateStatus: vi.fn().mockResolvedValue(undefined) } as unknown as PipelineServices['projectService'],
  rateLimitService: { decrementDailyLimit: vi.fn().mockResolvedValue(undefined) } as unknown as PipelineServices['rateLimitService'],
});

const makeInput = (): PipelineInput => ({
  projectId: 'proj-1',
  userId: 'user-1',
  correlationId: 'corr-1',
  apis: [],
  stage1SystemPrompt: 'stage1-system',
  stage1UserPrompt: 'stage1-user',
  stage2SystemPrompt: 'stage2-system',
  buildStage2UserPrompt: (code) => `stage2-user html=${code.html}`,
});

describe('runGenerationPipeline (2-stage)', () => {
  let mockAiProvider: ReturnType<typeof makeAiProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAiProvider = makeAiProvider();
    const { AiProviderFactory } = require('@/providers/ai/AiProviderFactory');
    AiProviderFactory.createForTask.mockReturnValue(mockAiProvider);
  });

  it('generateCodeStream을 정확히 2번 호출한다', async () => {
    await runGenerationPipeline(makeInput(), makeSse(), makeServices());
    expect(mockAiProvider.generateCodeStream).toHaveBeenCalledTimes(2);
  });

  it('1번째 호출은 stage1 프롬프트를 사용한다', async () => {
    await runGenerationPipeline(makeInput(), makeSse(), makeServices());
    expect(mockAiProvider.generateCodeStream).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ system: 'stage1-system', user: 'stage1-user' }),
      expect.any(Function),
    );
  });

  it('2번째 호출은 stage2 프롬프트를 사용한다', async () => {
    await runGenerationPipeline(makeInput(), makeSse(), makeServices());
    expect(mockAiProvider.generateCodeStream).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ system: 'stage2-system' }),
      expect.any(Function),
    );
  });

  it('stage1_generating → stage1_complete → stage2_generating 순서로 progress 이벤트를 전송한다', async () => {
    const sse = makeSse();
    await runGenerationPipeline(makeInput(), sse, makeServices());
    const steps = (sse.send as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => c[0] === 'progress')
      .map((c: unknown[]) => (c[1] as { step: string }).step);
    const s1Idx = steps.indexOf('stage1_generating');
    const s1cIdx = steps.indexOf('stage1_complete');
    const s2Idx = steps.indexOf('stage2_generating');
    expect(s1Idx).toBeGreaterThanOrEqual(0);
    expect(s1cIdx).toBeGreaterThan(s1Idx);
    expect(s2Idx).toBeGreaterThan(s1cIdx);
  });

  it('buildStage2UserPrompt 콜백이 stage1 출력을 받아 호출된다', async () => {
    const buildStage2UserPrompt = vi.fn().mockReturnValue('stage2-user-prompt');
    const input = { ...makeInput(), buildStage2UserPrompt };
    await runGenerationPipeline(input, makeSse(), makeServices());
    expect(buildStage2UserPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.any(String) }),
    );
  });

  it('complete 이벤트로 정상 종료된다', async () => {
    const sse = makeSse();
    await runGenerationPipeline(makeInput(), sse, makeServices());
    const eventNames = (sse.send as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    expect(eventNames).toContain('complete');
    expect(eventNames).not.toContain('error');
  });

  it('codeRepo.create는 1번만 호출된다 (Stage 1 저장 없음)', async () => {
    const services = makeServices();
    await runGenerationPipeline(makeInput(), makeSse(), services);
    expect(services.codeRepo.create).toHaveBeenCalledTimes(1);
  });

  it('Stage 1 실패 시 error 이벤트를 전송하고 Stage 2를 실행하지 않는다', async () => {
    mockAiProvider.generateCodeStream.mockRejectedValueOnce(new Error('Stage 1 실패'));
    const sse = makeSse();
    await runGenerationPipeline(makeInput(), sse, makeServices());
    const eventNames = (sse.send as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    expect(eventNames).toContain('error');
    expect(mockAiProvider.generateCodeStream).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test src/__tests__/lib/ai/generationPipeline.test.ts
```

Expected: 모든 테스트 FAIL (PipelineInput에 stage 필드가 없음)

- [ ] **Step 3: PipelineInput 인터페이스 교체**

`src/lib/ai/generationPipeline.ts` 의 `PipelineInput` export를 다음으로 교체한다:

```typescript
export interface PipelineInput {
  projectId: string;
  userId: string;
  correlationId: string | undefined;
  apis: ApiCatalogItem[];
  /** Stage 1 (구조·기능) 시스템 프롬프트 */
  stage1SystemPrompt: string;
  /** Stage 1 (구조·기능) 유저 프롬프트 */
  stage1UserPrompt: string;
  /** Stage 2 (디자인·폴리시) 시스템 프롬프트 */
  stage2SystemPrompt: string;
  /**
   * Stage 2 유저 프롬프트 빌더 — pipeline 내부에서 stage1 결과를 받아 호출된다.
   * generate: buildStage2UserPrompt(stage1Code)
   * regenerate: buildStage2RegenerationUserPrompt(stage1Code, feedback)
   */
  buildStage2UserPrompt: (stage1Code: { html: string; css: string; js: string }) => string;
  /** 코드 메타데이터에 병합할 추가 필드 (예: { userFeedback }) */
  extraMetadata?: Record<string, unknown>;
}
```

- [ ] **Step 4: runStage1() 내부 함수 추가**

`runGenerationPipeline` 함수 바로 위에 추가한다:

```typescript
async function runStage1(
  systemPrompt: string,
  userPrompt: string,
  aiProvider: IAiProvider,
  sse: SseWriter,
): Promise<{ html: string; css: string; js: string }> {
  let lastProgressUpdate = Date.now();
  const streamStartTime = Date.now();

  sse.send('progress', { step: 'stage1_generating', progress: 5, message: '1단계: 구조 및 기능 생성 중...' });

  const response = await aiProvider.generateCodeStream(
    { system: systemPrompt, user: userPrompt },
    (_chunk: string, accumulated: string) => {
      if (sse.isCancelled()) return;
      const now = Date.now();
      if (now - lastProgressUpdate < 500) return;
      lastProgressUpdate = now;
      const estimatedProgress = Math.min(40, 5 + Math.floor((accumulated.length / 15000) * 35));
      const elapsed = Math.floor((now - streamStartTime) / 1000);
      sse.send('progress', {
        step: 'stage1_generating',
        progress: estimatedProgress,
        message: `1단계: 구조 및 기능 생성 중... (${elapsed}초 경과, ${(accumulated.length / 1024).toFixed(1)}KB)`,
      });
    },
  );

  return parseGeneratedCode(response.content);
}
```

- [ ] **Step 5: runStage2() 내부 함수 추가**

`runStage1()` 아래에 추가한다:

```typescript
async function runStage2(
  stage1Code: { html: string; css: string; js: string },
  systemPrompt: string,
  buildUserPrompt: (code: { html: string; css: string; js: string }) => string,
  aiProvider: IAiProvider,
  sse: SseWriter,
): Promise<{
  parsed: { html: string; css: string; js: string };
  provider: string;
  model: string;
  durationMs: number;
  tokensUsed: unknown;
  userPromptUsed: string;
}> {
  sse.send('progress', { step: 'stage1_complete', progress: 45, message: '구조 완성. 디자인 적용 준비 중...' });
  sse.send('progress', { step: 'stage2_generating', progress: 50, message: '2단계: 디자인 및 인터랙션 적용 중...' });

  const userPrompt = buildUserPrompt(stage1Code);

  let lastProgressUpdate = Date.now();
  const streamStartTime = Date.now();

  const response = await aiProvider.generateCodeStream(
    { system: systemPrompt, user: userPrompt },
    (_chunk: string, accumulated: string) => {
      if (sse.isCancelled()) return;
      const now = Date.now();
      if (now - lastProgressUpdate < 500) return;
      lastProgressUpdate = now;
      const estimatedProgress = Math.min(82, 50 + Math.floor((accumulated.length / 15000) * 32));
      const elapsed = Math.floor((now - streamStartTime) / 1000);
      sse.send('progress', {
        step: 'stage2_generating',
        progress: estimatedProgress,
        message: `2단계: 디자인 및 인터랙션 적용 중... (${elapsed}초 경과, ${(accumulated.length / 1024).toFixed(1)}KB)`,
      });
    },
  );

  return {
    parsed: parseGeneratedCode(response.content),
    provider: response.provider,
    model: response.model,
    durationMs: response.durationMs,
    tokensUsed: response.tokensUsed,
    userPromptUsed: userPrompt,
  };
}
```

- [ ] **Step 6: runGenerationPipeline 오케스트레이션 교체**

`runGenerationPipeline` 내부의 현재 단일 AI 호출 코드를 2단계 호출로 교체한다.

현재 코드에서 `sse.send('progress', { step: 'analyzing', ...})` 직후부터 `let parsed = parseGeneratedCode(response.content);` 까지의 블록을 다음으로 교체한다:

```typescript
sse.send('progress', { step: 'analyzing', progress: 5, message: '분석 중...' });

try {
  aiProvider = AiProviderFactory.createForTask('generation');
} catch (factoryErr) {
  throw new Error(
    `AI 서비스 초기화 실패: ${factoryErr instanceof Error ? factoryErr.message : 'Unknown'}`,
  );
}

// Stage 1: 구조·기능 생성
const stage1Code = await runStage1(
  input.stage1SystemPrompt,
  input.stage1UserPrompt,
  aiProvider,
  sse,
);

if (sse.isCancelled()) return;

// Stage 2: 디자인·폴리시 적용
const stage2Result = await runStage2(
  stage1Code,
  input.stage2SystemPrompt,
  input.buildStage2UserPrompt,
  aiProvider,
  sse,
);

if (sse.isCancelled()) return;

sse.send('progress', { step: 'validating', progress: 85, message: '코드 검증 중...' });

let parsed = stage2Result.parsed;
const stage2Response = {
  provider: stage2Result.provider,
  model: stage2Result.model,
  durationMs: stage2Result.durationMs,
  tokensUsed: stage2Result.tokensUsed,
};
```

이후 코드에서 `response.provider`, `response.model`, `response.durationMs`, `response.tokensUsed` 참조를 `stage2Response.provider`, `stage2Response.model`, `stage2Response.durationMs`, `stage2Response.tokensUsed` 로 교체한다.

`codeRepo.create` 호출의 `aiPromptUsed: userPrompt` 를 `aiPromptUsed: stage2Result.userPromptUsed` 로 교체한다.

품질 루프(`for (let attempt = 0; attempt < 2; attempt++)`)의 내부에서 `systemPrompt` 참조를 `input.stage2SystemPrompt` 로 교체한다:

```typescript
// 기존:
const retryResponse = await aiProvider!.generateCode({ system: systemPrompt, user: improvementPrompt });
// 변경:
const retryResponse = await aiProvider!.generateCode({ system: input.stage2SystemPrompt, user: improvementPrompt });
```

- [ ] **Step 7: 테스트 실행 — 통과 확인**

```bash
pnpm test src/__tests__/lib/ai/generationPipeline.test.ts
```

Expected: 모든 테스트 PASS

- [ ] **Step 8: 전체 테스트 실행**

```bash
pnpm test
```

Expected: 289개 + 신규 테스트 전부 PASS

- [ ] **Step 9: 타입 체크**

```bash
pnpm type-check
```

Expected: 에러 없음

- [ ] **Step 10: 커밋**

```bash
git add src/lib/ai/generationPipeline.ts src/__tests__/lib/ai/generationPipeline.test.ts
git commit -m "feat: 2단계 생성 파이프라인 구현 (runStage1/runStage2)"
```

---

## Task 3: generate/route.ts — 2단계 프롬프트 연결

**Files:**
- Modify: `src/app/api/v1/generate/route.ts`

### 배경

현재 코드는 `buildSystemPrompt`, `buildUserPrompt`를 사용한다. 새 Stage 함수와 PipelineInput 필드로 교체한다.

---

- [ ] **Step 1: import 라인 교체**

`src/app/api/v1/generate/route.ts` 7번 라인:

```typescript
// 기존:
import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/promptBuilder';

// 변경:
import {
  buildStage1SystemPrompt,
  buildStage1UserPrompt,
  buildStage2SystemPrompt,
  buildStage2UserPrompt,
} from '@/lib/ai/promptBuilder';
```

- [ ] **Step 2: 프롬프트 빌드 및 PipelineInput 교체**

라인 66-68 (`systemPrompt`, `userPrompt` 선언):

```typescript
// 기존:
const systemPrompt = buildSystemPrompt(templateHint);
const designPreferences = (project.metadata as Record<string, unknown>)?.designPreferences as DesignPreferences | undefined;
const userPrompt = buildUserPrompt(apis, project.context, project.id, designPreferences);

// 변경:
const designPreferences = (project.metadata as Record<string, unknown>)?.designPreferences as DesignPreferences | undefined;
const stage1SystemPrompt = buildStage1SystemPrompt(templateHint);
const stage1UserPrompt = buildStage1UserPrompt(apis, project.context, project.id, designPreferences);
const stage2SystemPrompt = buildStage2SystemPrompt();
```

라인 74-83 (`runGenerationPipeline` 호출의 첫 번째 인자 객체):

```typescript
// 기존:
{
  projectId,
  userId: user.id,
  correlationId,
  apis,
  systemPrompt,
  userPrompt,
  streamingLabel: '코드 생성 중...',
}

// 변경:
{
  projectId,
  userId: user.id,
  correlationId,
  apis,
  stage1SystemPrompt,
  stage1UserPrompt,
  stage2SystemPrompt,
  buildStage2UserPrompt: (stage1Code) => buildStage2UserPrompt(stage1Code),
}
```

- [ ] **Step 3: 타입 체크**

```bash
pnpm type-check
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/v1/generate/route.ts
git commit -m "feat: generate/route.ts — 2단계 프롬프트 연결"
```

---

## Task 4: regenerate/route.ts — 2단계 프롬프트 연결

**Files:**
- Modify: `src/app/api/v1/generate/regenerate/route.ts`

---

- [ ] **Step 1: import 라인 교체**

`src/app/api/v1/generate/regenerate/route.ts` 6번 라인:

```typescript
// 기존:
import { buildSystemPrompt, buildRegenerationPrompt } from '@/lib/ai/promptBuilder';

// 변경:
import {
  buildStage1SystemPrompt,
  buildStage1RegenerationUserPrompt,
  buildStage2SystemPrompt,
  buildStage2RegenerationUserPrompt,
} from '@/lib/ai/promptBuilder';
```

- [ ] **Step 2: 프롬프트 빌드 및 PipelineInput 교체**

라인 75-80 (`systemPrompt`, `userPrompt` 선언):

```typescript
// 기존:
const systemPrompt = buildSystemPrompt();
const userPrompt = buildRegenerationPrompt(
  { html: previousCode.codeHtml, css: previousCode.codeCss, js: previousCode.codeJs },
  feedback,
  projectApis,
);

// 변경:
const stage1SystemPrompt = buildStage1SystemPrompt();
const stage1UserPrompt = buildStage1RegenerationUserPrompt(
  { html: previousCode.codeHtml, css: previousCode.codeCss, js: previousCode.codeJs },
  feedback,
  projectApis,
);
const stage2SystemPrompt = buildStage2SystemPrompt();
```

라인 86-96 (`runGenerationPipeline` 호출의 첫 번째 인자 객체):

```typescript
// 기존:
{
  projectId,
  userId: user.id,
  correlationId,
  apis: projectApis,
  systemPrompt,
  userPrompt,
  extraMetadata: { userFeedback: feedback },
  streamingLabel: '코드 수정 중...',
}

// 변경:
{
  projectId,
  userId: user.id,
  correlationId,
  apis: projectApis,
  stage1SystemPrompt,
  stage1UserPrompt,
  stage2SystemPrompt,
  buildStage2UserPrompt: (stage1Code) => buildStage2RegenerationUserPrompt(stage1Code, feedback),
  extraMetadata: { userFeedback: feedback },
}
```

- [ ] **Step 3: 전체 테스트 실행**

```bash
pnpm test
```

Expected: 전체 테스트 PASS

- [ ] **Step 4: 타입 체크 + 린트**

```bash
pnpm type-check && pnpm lint
```

Expected: 에러·경고 없음

- [ ] **Step 5: 최종 커밋**

```bash
git add src/app/api/v1/generate/regenerate/route.ts
git commit -m "feat: regenerate/route.ts — 2단계 프롬프트 연결"
```

---

## 검증 체크리스트

```bash
pnpm type-check   # 타입 에러 0
pnpm test         # 전체 테스트 PASS
pnpm lint         # 경고 0
pnpm build        # standalone 빌드 성공
```

**수동 검증 (pnpm dev 후):**
- 빌더 페이지에서 새 프로젝트 생성 → 코드 생성 시 progress 메시지가 "1단계: 구조 및 기능 생성 중..." → "2단계: 디자인 및 인터랙션 적용 중..." 순서로 표시되는지 확인
- 재생성 시 동일하게 2단계 메시지 표시 확인
- 생성된 결과물에 @keyframes 애니메이션, 토스트, 스켈레톤 패턴이 포함되어 있는지 확인
