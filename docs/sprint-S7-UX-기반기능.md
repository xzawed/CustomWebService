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

## S7 완료 조건 종합

- [ ] 다크 모드 토글 정상 동작 + 전체 페이지 반영
- [ ] 코드 뷰어에서 HTML/CSS/JS 확인 및 복사/다운로드
- [ ] 빌더 초안 자동 저장 및 복원
- [ ] 6종 템플릿 선택 및 코드 생성
- [ ] 빌드 통과, 기존 기능 회귀 없음
