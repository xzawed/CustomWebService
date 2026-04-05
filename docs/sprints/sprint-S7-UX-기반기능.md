# Sprint 7 — UX 기반 기능 (다크 모드 · 코드 뷰어 · 초안 저장 · 추가 템플릿)

> 기반 문서: `docs/20_확장성_분석_및_로드맵.md` Phase 1
> 선행 조건: S5 완료 (인프라 안정화)
> 예상 기간: 1~2주
> 목표: 기존 기반 시설(피처 플래그, persist 미들웨어, TemplateRegistry)을 활용한 즉시 구현 가능 기능 4종

---

## 진행 현황

| 태스크 | 목표 | 상태 |
|--------|------|------|
| S7-1 | 다크 모드 | ⏳ 대기 |
| S7-2 | 코드 뷰어 | ⏳ 대기 |
| S7-3 | 빌더 초안 자동 저장 | ⏳ 대기 |
| S7-4 | 추가 코드 템플릿 3종 | ⏳ 대기 |

---

## S7-1. 다크 모드

> `enable_dark_mode` 피처 플래그 활성화 + Tailwind `dark:` 클래스 적용

### 구현 내용

**1) ThemeProvider 생성**

**신규 파일:** `src/components/providers/ThemeProvider.tsx`

```typescript
// 클라이언트 컴포넌트
// - localStorage에서 테마 읽기 (system / light / dark)
// - <html> 태그에 class="dark" 토글
// - system 선택 시 prefers-color-scheme 미디어 쿼리 연동
```

**2) 테마 토글 버튼**

**수정 파일:** `src/components/layout/Header.tsx`

- 우측 상단에 🌙/☀️ 토글 아이콘 추가
- `featureFlags.enableDarkMode === false` 이면 버튼 숨김

**3) 루트 레이아웃 연결**

**수정 파일:** `src/app/layout.tsx`

- `<html>` 태그에 `suppressHydrationWarning` 추가 (SSR/CSR 불일치 방지)
- ThemeProvider로 children 래핑

**4) 컴포넌트별 다크 스타일 적용**

**수정 대상 파일:**
- `src/components/layout/Header.tsx` — 네비게이션 배경/텍스트
- `src/components/layout/Footer.tsx` — 푸터 배경/텍스트/링크
- `src/components/catalog/ApiCard.tsx` — 카드 배경/보더
- `src/components/catalog/CatalogView.tsx` — 그리드 배경
- `src/components/catalog/ApiDetailModal.tsx` — 모달 배경/오버레이
- `src/components/catalog/ApiSearchBar.tsx` — 입력 필드
- `src/components/catalog/CategoryTabs.tsx` — 탭 배경/활성색
- `src/components/builder/StepIndicator.tsx` — 스텝 색상
- `src/components/builder/ContextInput.tsx` — 텍스트 영역
- `src/components/builder/TemplateSelector.tsx` — 템플릿 버튼
- `src/components/builder/GenerationProgress.tsx` — 진행바
- `src/components/dashboard/ProjectCard.tsx` — 카드
- `src/components/dashboard/ProjectGrid.tsx` — 빈 상태
- `src/app/page.tsx` — 랜딩 페이지
- `src/app/(main)/layout.tsx` — 메인 배경 `bg-gray-50` → `dark:bg-gray-900`
- `src/app/(main)/terms/page.tsx`, `privacy/page.tsx`, `disclaimer/page.tsx` — 법적 페이지

**적용 패턴:**
```tsx
// 기존
<div className="bg-white text-gray-900 border-gray-200">

// 다크 모드 추가
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700">
```

**5) 피처 플래그 활성화**

```sql
UPDATE feature_flags SET enabled = true WHERE flag_name = 'enable_dark_mode';
```

### 완료 조건
- [ ] Header에 테마 토글 버튼 표시
- [ ] 다크 모드 전환 시 전체 페이지 색상 변경
- [ ] 새로고침 후 선택한 테마 유지 (localStorage)
- [ ] 시스템 테마 연동 동작
- [ ] `enable_dark_mode = false` 시 토글 버튼 숨김

---

## S7-2. 코드 뷰어

> 생성된 HTML/CSS/JS 코드를 구문 강조 표시 + 복사 기능

### 구현 내용

**1) CodeViewer 컴포넌트 생성**

**신규 파일:** `src/components/builder/CodeViewer.tsx`

```typescript
interface CodeViewerProps {
  html: string;
  css: string;
  js: string;
}

// - HTML / CSS / JS 탭 전환
// - 줄 번호 표시
// - 구문 강조 (CSS 기반, 외부 라이브러리 없이 기본 키워드 하이라이팅)
// - "복사" 버튼 (navigator.clipboard.writeText)
// - "전체 다운로드" 버튼 (index.html로 조합하여 다운로드)
```

**2) 빌더 Step3 연결**

**수정 파일:** `src/app/(main)/builder/page.tsx`

- 생성 완료 후 "미리보기" / "코드 보기" 탭 전환 UI
- `enable_code_viewer` 플래그 확인 후 탭 표시

**3) 대시보드 상세 페이지 연결**

**수정 파일:** `src/app/(main)/dashboard/[id]/page.tsx`

- 프로젝트 상세에서 "코드 보기" 버튼 → CodeViewer 모달 또는 섹션

### 완료 조건
- [ ] 생성 완료 후 "코드 보기" 탭에서 HTML/CSS/JS 확인 가능
- [ ] 각 탭에서 "복사" 클릭 시 클립보드에 코드 복사
- [ ] "다운로드" 클릭 시 index.html 파일 다운로드
- [ ] 대시보드 상세에서도 코드 확인 가능
- [ ] `enable_code_viewer = false` 시 탭 숨김

---

## S7-3. 빌더 초안 자동 저장

> apiSelectionStore에 persist 미들웨어 확장 + 복원 UI

### 구현 내용

**1) apiSelectionStore에 persist 추가**

**수정 파일:** `src/stores/apiSelectionStore.ts`

```typescript
// 현재: create<ApiSelectionState>()((set) => ({ ... }))
// 변경: create<ApiSelectionState>()(persist((set) => ({ ... }), {
//   name: 'builder-api-selection'
// }))
```

**2) 빌더 진입 시 복원 안내**

**수정 파일:** `src/app/(main)/builder/page.tsx`

- 빌더 진입 시 저장된 초안이 있으면 "이전 작업을 이어서 하시겠습니까?" 토스트 표시
- "이어서 하기" → 저장된 상태 유지
- "새로 시작" → 스토어 초기화

**3) 생성 완료 후 초기화**

**수정 파일:** `src/hooks/useGeneration.ts`

- 생성 성공 시 apiSelectionStore.reset() + contextStore.reset() 호출
- 이미 contextStore에는 reset이 있으므로 apiSelectionStore에 reset 액션 추가

### 완료 조건
- [ ] API 선택 + 컨텍스트 입력 후 새로고침 → 데이터 유지
- [ ] 빌더 재진입 시 복원 안내 표시
- [ ] "새로 시작" 선택 시 초기화
- [ ] 코드 생성 완료 후 자동 초기화

---

## S7-4. 추가 코드 템플릿 3종

> TemplateRegistry.register()로 동적 추가 — 코드 수정 최소화

### 구현 내용

**1) SearchTemplate (검색/조회)**

**신규 파일:** `src/templates/SearchTemplate.ts`

```typescript
// id: 'search'
// name: '🔍 정보 조회'
// supportedApiCategories: ['데이터', '뉴스', '소셜', 'data', 'news', 'social']
// generate(): 검색바 + 카드 리스트 + 페이지네이션 골격
// promptHint: "검색어 입력 → API 호출 → 카드 형태 결과 표시"
```

**2) FeedTemplate (뉴스/피드)**

**신규 파일:** `src/templates/FeedTemplate.ts`

```typescript
// id: 'feed'
// name: '📰 피드'
// supportedApiCategories: ['뉴스', '소셜', '엔터테인먼트', 'news', 'social', 'entertainment']
// generate(): 무한 스크롤 피드 + 카테고리 필터 골격
// promptHint: "뉴스피드 스타일 스크롤 레이아웃, 카테고리 필터"
```

**3) MapTemplate (지도 기반)**

**신규 파일:** `src/templates/MapTemplate.ts`

```typescript
// id: 'map'
// name: '🗺 지도 서비스'
// supportedApiCategories: ['위치', '지도', '날씨', 'location', 'map', 'weather', 'geo']
// generate(): Leaflet/OpenStreetMap 기반 지도 + 마커 + 사이드패널 골격
// promptHint: "지도 위에 API 데이터를 마커로 표시, 클릭 시 상세 팝업"
```

**4) TemplateRegistry에 등록**

**수정 파일:** `src/templates/TemplateRegistry.ts`

```typescript
// constructor에 추가
this.register(new SearchTemplate());
this.register(new FeedTemplate());
this.register(new MapTemplate());
```

**5) 빌더 TemplateSelector UI 업데이트**

**수정 파일:** `src/components/builder/TemplateSelector.tsx`

- 기존 3종 → 6종 템플릿 버튼 그리드 (2×3 또는 3×2 레이아웃)
- `enable_template_system` 플래그 확인

**6) 피처 플래그 활성화**

```sql
UPDATE feature_flags SET enabled = true WHERE flag_name = 'enable_template_system';
```

### 완료 조건
- [ ] 빌더 Step2에서 6개 템플릿 버튼 표시
- [ ] 각 템플릿 클릭 시 컨텍스트 자동 채움
- [ ] `findBestMatch(apis)` 호출 시 6종 중 최적 매칭
- [ ] 새 템플릿으로 코드 생성 정상 동작
- [ ] 빌드 에러 없음

---

## S7 테스트 계획

### 단위 테스트 (Unit Tests)

**신규 테스트 파일 및 케이스:**

#### `src/components/providers/ThemeProvider.test.ts` (S7-1)
```
describe('ThemeProvider')
├── it('localStorage에 저장된 테마를 초기 로드한다')
├── it('테마가 없으면 system 기본값을 사용한다')
├── it('dark 테마 설정 시 html에 dark 클래스를 추가한다')
├── it('light 테마 설정 시 html에서 dark 클래스를 제거한다')
├── it('system 테마 시 prefers-color-scheme을 따른다')
└── it('테마 변경 시 localStorage에 저장한다')
```
예상 테스트 수: **6개**

#### `src/components/builder/CodeViewer.test.ts` (S7-2)
```
describe('CodeViewer')
├── it('HTML 탭이 기본 선택되어 있다')
├── it('CSS 탭 클릭 시 CSS 코드를 표시한다')
├── it('JS 탭 클릭 시 JavaScript 코드를 표시한다')
├── it('복사 버튼 클릭 시 현재 탭 코드를 클립보드에 복사한다')
├── it('다운로드 버튼 클릭 시 조합된 HTML 파일을 생성한다')
└── it('빈 코드 전달 시 안내 메시지를 표시한다')
```
예상 테스트 수: **6개**

#### `src/stores/apiSelectionStore.test.ts` (S7-3)
```
describe('apiSelectionStore persist')
├── it('API 선택 시 localStorage에 자동 저장한다')
├── it('페이지 로드 시 localStorage에서 복원한다')
├── it('reset() 호출 시 localStorage를 초기화한다')
└── it('최대 API 개수 초과 시 추가를 거부한다')
```
예상 테스트 수: **4개**

#### `src/templates/SearchTemplate.test.ts` (S7-4)
```
describe('SearchTemplate')
├── describe('matchScore')
│   ├── it('데이터 카테고리 API에 높은 점수를 반환한다')
│   ├── it('무관한 카테고리 API에 0을 반환한다')
│   └── it('혼합 API에 비례 점수를 반환한다')
└── describe('generate')
    ├── it('검색바를 포함한 HTML을 생성한다')
    ├── it('promptHint에 검색 관련 지시를 포함한다')
    └── it('CSS에 카드 그리드 스타일을 포함한다')
```
예상 테스트 수: **6개** (FeedTemplate, MapTemplate 각각 동일 → **18개**)

### 통합 테스트 (Integration Tests)

#### `src/__tests__/integration/dark-mode.test.ts`
```
describe('다크 모드 통합')
├── it('enable_dark_mode=false 시 토글 버튼이 렌더되지 않는다')
└── it('enable_dark_mode=true 시 토글 버튼이 렌더된다')
```
예상 테스트 수: **2개**

#### `src/__tests__/integration/template-registry.test.ts`
```
describe('TemplateRegistry 통합')
├── it('6종 템플릿이 모두 등록되어 있다')
├── it('findBestMatch가 날씨 API에 DashboardTemplate을 반환한다')
├── it('findBestMatch가 뉴스 API에 FeedTemplate을 반환한다')
└── it('findBestMatch가 지도 API에 MapTemplate을 반환한다')
```
예상 테스트 수: **4개**

### 코드 품질 검토 체크리스트

#### 정적 분석
- [ ] `pnpm lint` — ESLint 경고/에러 0건
- [ ] `pnpm type-check` — TypeScript 컴파일 에러 0건 (기존 vitest/msw 제외)
- [ ] `pnpm format:check` — Prettier 포맷 위반 0건

#### 코드 리뷰 포인트
- [ ] ThemeProvider가 SSR/CSR 하이드레이션 불일치를 발생시키지 않는가
- [ ] 다크 모드 색상이 WCAG AA 대비 비율(4.5:1) 이상인가
- [ ] CodeViewer에서 XSS 위험 없이 코드를 표시하는가 (innerHTML 대신 textContent)
- [ ] localStorage 접근 시 try-catch로 예외 처리하는가 (시크릿 모드 등)
- [ ] 새 템플릿의 matchScore 알고리즘이 기존 3종과 일관적인가
- [ ] 피처 플래그 확인이 서버/클라이언트 양쪽에서 동작하는가

#### 성능
- [ ] 다크 모드 전환 시 FOUC(Flash of Unstyled Content) 없는가
- [ ] 코드 뷰어의 큰 코드(10,000자 이상)에서 렌더링 지연 없는가
- [ ] localStorage 저장이 빌더 입력 UX를 블로킹하지 않는가

#### 테스트 커버리지 목표
- [ ] 신규 코드 라인 커버리지 **80% 이상**
- [ ] 신규 테스트 **40개 이상** 추가 (기존 94개 → 134개)

---

## S7 완료 조건 종합

- [ ] 다크 모드 토글 정상 동작 + 전체 페이지 반영
- [ ] 코드 뷰어에서 HTML/CSS/JS 확인 및 복사/다운로드
- [ ] 빌더 초안 자동 저장 및 복원
- [ ] 6종 템플릿 선택 및 코드 생성
- [ ] 빌드 통과, 기존 기능 회귀 없음
