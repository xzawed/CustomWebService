프로젝트의 기존 UI 패턴을 따라 새로운 React 컴포넌트를 생성하세요.

컴포넌트 설명: $ARGUMENTS

## 생성 절차

### 1. 기존 패턴 확인
- `src/components/` 내 유사한 컴포넌트 구조 확인
- `src/components/ui/` — 기본 UI 컴포넌트 (재사용)
- 프로젝트의 Tailwind CSS 4 + Lucide React 아이콘 패턴 따르기

### 2. 컴포넌트 생성
- **위치**: `src/components/{카테고리}/` (builder, catalog, dashboard, layout, settings, ui 중 적절한 곳)
- **파일명**: PascalCase (`ComponentName.tsx`)
- **구조**:
  ```tsx
  'use client'; // 클라이언트 컴포넌트인 경우만

  interface ComponentNameProps { ... }

  export function ComponentName({ ...props }: ComponentNameProps) {
    return ( ... );
  }
  ```

### 3. 스타일링 규칙
- Tailwind CSS 4 유틸리티 클래스 사용
- CSS 변수 활용 (다크/라이트 테마 지원): `var(--color-*)` 패턴
- 반응형: `sm:`, `md:`, `lg:` 브레이크포인트
- 아이콘: `lucide-react`에서 import

### 4. 상태 관리
- 로컬 상태: `useState`, `useReducer`
- 글로벌 상태: `src/stores/` 의 Zustand 스토어 사용
- 폼: `react-hook-form` + `zod` 스키마
- 커스텀 훅: `src/hooks/` 확인 후 재사용 또는 새로 생성

### 5. 접근성
- 시맨틱 HTML 태그 사용
- `aria-label`, `role` 속성 적절히 추가
- 키보드 네비게이션 지원

### 6. 참고 파일
- `src/components/` 내 기존 컴포넌트 패턴
- `src/app/globals.css` — CSS 변수 및 테마 정의
- `src/hooks/` — 재사용 가능한 커스텀 훅
