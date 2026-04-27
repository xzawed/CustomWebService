# 설계 문서: React 컴포넌트 테스트 도입

**날짜**: 2026-04-27  
**상태**: 승인됨  
**우선순위**: A안 첫 번째 항목 (안정성 우선)

---

## 1. 배경 및 목표

### 현황

- 컴포넌트 총 32개, 테스트 파일 2개 (PublishDialog, RePromptSection) — 커버리지 약 6%
- `vitest.config.ts`의 `coverage.include`에서 `src/components/**` 제외됨
- `@testing-library/react`는 이미 devDependency에 존재
- 기존 1,129개 Vitest 테스트는 `node` 환경으로 안정적으로 운영 중

### 목표

- UI 회귀(regression) 방지 — 사용자가 경험하는 화면이 정확히 동작하는지 검증
- SonarCloud 커버리지 측정 대상에 `src/components/**` 포함
- 기존 1,129개 테스트에 영향 없이 컴포넌트 테스트 환경 추가

### 범위 밖

- `GenerationProgress`, `RePromptPanel`, `Header`, `ProjectGrid` — SSE·인증 복합 의존으로 단위 테스트 비효율. E2E 영역으로 분류
- Playwright E2E 테스트 신규 작성 (별도 작업)
- Storybook 도입 (별도 검토)

---

## 2. 접근법 결정

### 검토한 세 가지 방식

| 방식 | 설명 | 기존 테스트 영향 | 채택 여부 |
|------|------|----------------|----------|
| A. 전역 환경 변경 | `vitest.config.ts`의 `environment`를 `happy-dom`으로 변경 | 1,129개 재검증 필요 | ❌ |
| **B. 파일별 지시자** | 각 테스트 파일 첫 줄에 `// @vitest-environment happy-dom` | **영향 없음** | ✅ |
| C. Workspace 분리 | `vitest.workspace.ts`로 환경 분리 | 없음, 설정 복잡 | ❌ |

### 선택: B (파일별 환경 지시자)

- `PublishDialog.test.tsx`, `RePromptSection.test.tsx`에서 이미 검증된 패턴
- 기존 API 라우트·lib·서비스·Repository 테스트 완전 보호
- 추가 설정 파일 없이 기존 인프라 활용

---

## 3. 설정 변경

### 3.1 vitest.config.ts

```typescript
coverage: {
  include: [
    'src/lib/**',
    'src/services/**',
    'src/providers/**',
    'src/repositories/**',
    'src/components/**',   // ← 추가
  ],
}
```

임계값은 현행 유지 (컴포넌트 커버리지는 측정 시작만 목표, 강제 임계값 미적용).

### 3.2 신규 파일 3개

#### `src/test/mocks/zustand.ts`
Zustand store mock 팩토리. 컴포넌트 테스트에서 store를 주입할 때 사용.

```typescript
// 패턴 예시
export function mockThemeStore(overrides = {}) {
  return { theme: 'light', setTheme: vi.fn(), ...overrides };
}
export function mockContextStore(overrides = {}) {
  return { designPreferences: null, setDesignPreferences: vi.fn(), ...overrides };
}
```

#### `src/test/helpers/component.ts`
`@testing-library/react`의 `render`를 래핑. 추후 Provider 추가 시 단일 지점 수정.

```typescript
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

export function renderComponent(ui: ReactElement, options?: RenderOptions) {
  return render(ui, options);
}

export * from '@testing-library/react';
```

#### 파일 선두 지시자 규칙
모든 `*.test.tsx` 파일 첫 줄:
```typescript
// @vitest-environment happy-dom
```

---

## 4. 테스트 대상 컴포넌트

### Phase 1 — 순수 UI (2주)

외부 의존성이 최소이고 비즈니스 중요도가 높은 컴포넌트 우선.

| 컴포넌트 | 위치 | 핵심 테스트 케이스 | Mock 필요 |
|---------|------|-----------------|----------|
| `StepIndicator` | `builder/` | 현재 단계 강조, 완료 체크마크, 연결선 색상 | 없음 |
| `CategoryTabs` | `catalog/` | 활성 탭 스타일, 클릭 시 onCategoryChange 호출 | 없음 |
| `ApiCard` | `catalog/` | 선택/미선택 상태, 배지 렌더링, onClick 콜백 | 없음 |
| `GuideQuestions` | `builder/` | 토글 열림·닫힘, onInsert 콜백 | 없음 |
| `ApiDetailModal` | `catalog/` | ESC 키 닫기, 배경 클릭 닫기, 엔드포인트 표시 | 없음 |
| `ApiSearchBar` | `catalog/` | debounce 동작, clear 버튼, vi.useFakeTimers 사용 | 없음 |
| `ContextSuggestions` | `builder/` | 로딩 skeleton, 추천 카드 렌더링, 선택 콜백 | 없음 |

### Phase 2 — 상태 + 이벤트 (2주)

상태 관리·Next.js router·clipboard 등 mock이 필요한 컴포넌트.

| 컴포넌트 | 위치 | 핵심 테스트 케이스 | Mock 필요 |
|---------|------|-----------------|----------|
| `ProjectCard` | `dashboard/` | 상태 배지, clipboard 복사, buildPublishUrl | `next/navigation`, `navigator.clipboard` |
| `ApiRecommendations` | `builder/` | 로딩·에러·추천 3분기 렌더링 | 없음 (props 기반) |
| `BuilderModeToggle` | `builder/` | 모드 텍스트 표시, onReset 콜백 | 없음 |
| `TemplateSelector` | `builder/` | 12개 템플릿 버튼, AI 배지 | 없음 |
| `CatalogView` | `catalog/` | 검색어 필터링, 카테고리 필터, 모달 열기 | 없음 |
| `ProjectPublishActions` | `dashboard/` | 슬러그 유무 분기, PublishDialog 열기 | `next/navigation`, `usePublish` hook |
| `ApiKeyGuideModal` | `settings/` | 가이드 내용 렌더링, 닫기 버튼 | 없음 |

### Phase 3+ (보류)

| 컴포넌트 | 보류 이유 |
|---------|----------|
| `GenerationProgress` | SSE 스트림·interval 복합 상태 |
| `RePromptPanel` | SSE 폴링·fetch mock 복잡 |
| `Header` | useAuth·useAuthStore·useRouter 복합 |
| `ProjectGrid` | DELETE fetch 통합 |
| `PreviewFrame` | iframe sandbox 환경 |

---

## 5. Mock 전략

### Next.js Navigation

```typescript
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/dashboard',
}));
```

### Zustand Store

```typescript
vi.mock('@/stores/themeStore', () => ({
  useThemeStore: () => mockThemeStore(),
}));
```

### Clipboard API

```typescript
beforeEach(() => {
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });
```

### 타이머 (ApiSearchBar debounce)

```typescript
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it('300ms debounce 후 onChange 호출', async () => {
  await userEvent.type(input, 'test');
  expect(onChange).not.toHaveBeenCalled();
  vi.advanceTimersByTime(300);
  expect(onChange).toHaveBeenCalledWith('test');
});
```

---

## 6. 파일 구조 (완료 후)

```
src/
├── test/
│   ├── mocks/
│   │   ├── handlers.ts          (기존)
│   │   ├── server.ts            (기존)
│   │   └── zustand.ts           ← 신규
│   ├── helpers/
│   │   └── component.ts         ← 신규
│   └── setup.ts                 (기존)
└── components/
    ├── builder/
    │   ├── StepIndicator.test.tsx       ← Phase 1
    │   ├── GuideQuestions.test.tsx      ← Phase 1
    │   ├── ContextSuggestions.test.tsx  ← Phase 1
    │   ├── ApiRecommendations.test.tsx  ← Phase 2
    │   ├── BuilderModeToggle.test.tsx   ← Phase 2
    │   └── TemplateSelector.test.tsx    ← Phase 2
    ├── catalog/
    │   ├── CategoryTabs.test.tsx        ← Phase 1
    │   ├── ApiCard.test.tsx             ← Phase 1
    │   ├── ApiSearchBar.test.tsx        ← Phase 1
    │   ├── ApiDetailModal.test.tsx      ← Phase 1
    │   └── CatalogView.test.tsx         ← Phase 2
    ├── dashboard/
    │   ├── PublishDialog.test.tsx       (기존)
    │   ├── RePromptSection.test.tsx     (기존)
    │   ├── ProjectCard.test.tsx         ← Phase 2
    │   └── ProjectPublishActions.test.tsx ← Phase 2
    └── settings/
        └── ApiKeyGuideModal.test.tsx    ← Phase 2
```

---

## 7. 예상 성과

| 지표 | 현재 | Phase 1 완료 | Phase 2 완료 |
|------|------|-------------|-------------|
| 컴포넌트 테스트 파일 | 2개 | 9개 | 16개 |
| 전체 Vitest 테스트 수 | 1,129개 | ~1,150개 | ~1,185개 |
| 컴포넌트 커버리지 (측정 시작) | 미측정 | 측정 시작 | ~50%+ |
| SonarCloud 대상 | lib/services/providers/repositories | + components | + components |

---

## 8. 리스크 및 완화

| 리스크 | 확률 | 완화 방안 |
|--------|------|---------|
| 기존 1,129개 테스트 회귀 | 낮음 | 파일별 지시자 방식으로 환경 격리 |
| Zustand mock 누락으로 테스트 실패 | 중간 | `src/test/mocks/zustand.ts` 팩토리 선 작성 후 컴포넌트 테스트 시작 |
| debounce/timer 테스트 flake | 중간 | `vi.useFakeTimers()` + `vi.useRealTimers()` afterEach 철저히 적용 |
| `@vitest-environment` 지시자 누락 | 중간 | PR 체크리스트 항목으로 추가 |

---

## 9. 연관 결정 사항 (로드맵 조정)

이번 설계 세션에서 확정된 로드맵 변경:

- **Item 2 (RBAC/팀·조직)**: 조건부 보류 — 팀 기능 실사용자 요청이 발생할 때 재검토
- **Item 3 (React/Vite + esbuild)**: 조건부 보류 — Alpine.js 한계 사례 월 50건 이상 또는 복잡한 상태 관리 필요 비율 10% 초과 시 재검토
