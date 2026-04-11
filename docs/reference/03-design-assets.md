# 디자인 에셋 준비 (Design Asset Preparation)

> 개발 시작 전 준비해야 할 디자인 리소스 목록 및 제작 방법
> 모든 에셋은 무료 도구로 제작

---

## 1. 필수 에셋 목록

### 1.1 브랜딩 에셋

| # | 에셋 | 규격 | 형식 | 제작 도구 | 우선순위 | 확인 |
|---|------|------|------|-----------|---------|------|
| 1 | **로고 (가로형)** | 높이 40px 기준 | SVG + PNG | Figma (무료) | Sprint 1 | ☐ |
| 2 | **로고 (아이콘형)** | 128×128px | SVG + PNG | Figma | Sprint 1 | ☐ |
| 3 | **파비콘** | 16×16, 32×32, 48×48 | ICO + PNG | RealFaviconGenerator | Sprint 1 | ☐ |
| 4 | **Apple Touch Icon** | 180×180px | PNG | Figma | Sprint 1 | ☐ |
| 5 | **OG 이미지 (기본)** | 1200×630px | PNG/JPG | Canva (무료) | Sprint 8 | ☐ |
| 6 | **OG 이미지 (생성 서비스)** | 1200×630px 템플릿 | PNG | 동적 생성 (Vercel OG) | Sprint 8 | ☐ |

### 1.2 아이콘 세트

| # | 에셋 | 수량 | 소스 | 확인 |
|---|------|------|------|------|
| 1 | **UI 아이콘** | ~30개 | Lucide Icons (MIT 라이선스) | ☐ |
| 2 | **카테고리 아이콘** | 10개 | Lucide Icons | ☐ |
| 3 | **API 서비스 로고** | 20~30개 | 각 API 공식 브랜드 가이드 또는 SimpleIcons | ☐ |

**카테고리별 아이콘 매핑 (Lucide):**

| 카테고리 | Lucide 아이콘명 | 용도 |
|---------|----------------|------|
| 날씨 | `Cloud`, `Sun`, `CloudRain` | 카탈로그 탭 |
| 뉴스 | `Newspaper` | 카탈로그 탭 |
| 금융/환율 | `DollarSign`, `TrendingUp` | 카탈로그 탭 |
| 지도/위치 | `MapPin`, `Globe` | 카탈로그 탭 |
| 번역/언어 | `Languages` | 카탈로그 탭 |
| 이미지/미디어 | `Image`, `Camera` | 카탈로그 탭 |
| 데이터 | `Database`, `BarChart` | 카탈로그 탭 |
| 유틸리티 | `Wrench`, `Settings` | 카탈로그 탭 |
| 엔터테인먼트 | `Film`, `Gamepad2` | 카탈로그 탭 |
| 소셜 | `Users`, `MessageCircle` | 카탈로그 탭 |

### 1.3 일러스트레이션

| # | 에셋 | 사용 위치 | 소스 | 확인 |
|---|------|-----------|------|------|
| 1 | **빈 상태 - 검색 없음** | API 검색 결과 없음 | unDraw (무료) | ☐ |
| 2 | **빈 상태 - 프로젝트 없음** | 대시보드 첫 방문 | unDraw | ☐ |
| 3 | **생성 중 애니메이션** | Step 3 생성 대기 | Lottie (LottieFiles 무료) | ☐ |
| 4 | **에러 - 404** | 404 페이지 | unDraw | ☐ |
| 5 | **에러 - 500** | 500 페이지 | unDraw | ☐ |
| 6 | **랜딩 - 히어로** | 랜딩 페이지 상단 | unDraw 또는 자체 제작 | ☐ |

**무료 일러스트 소스:**
- unDraw: https://undraw.co (MIT, 색상 커스텀 가능)
- Storyset: https://storyset.com (무료, 애니메이션 지원)
- Humaaans: https://humaaans.com (무료, 조합형)

---

## 2. 디자인 시스템

### 2.1 컬러 팔레트

```css
:root {
  /* Primary */
  --primary-50: #EFF6FF;
  --primary-100: #DBEAFE;
  --primary-200: #BFDBFE;
  --primary-300: #93C5FD;
  --primary-400: #60A5FA;
  --primary-500: #3B82F6;   /* 메인 Primary */
  --primary-600: #2563EB;
  --primary-700: #1D4ED8;
  --primary-800: #1E40AF;
  --primary-900: #1E3A8A;

  /* Neutral (Gray) */
  --gray-50: #F9FAFB;       /* 배경 */
  --gray-100: #F3F4F6;
  --gray-200: #E5E7EB;      /* 보더 */
  --gray-300: #D1D5DB;
  --gray-400: #9CA3AF;
  --gray-500: #6B7280;      /* 보조 텍스트 */
  --gray-600: #4B5563;
  --gray-700: #374151;
  --gray-800: #1F2937;
  --gray-900: #111827;      /* 메인 텍스트 */

  /* Semantic */
  --success: #10B981;
  --warning: #F59E0B;
  --error: #EF4444;
  --info: #3B82F6;
}
```

### 2.2 타이포그래피

```css
:root {
  /* Font Family */
  --font-sans: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Font Size */
  --text-xs: 0.75rem;      /* 12px */
  --text-sm: 0.875rem;     /* 14px */
  --text-base: 1rem;       /* 16px */
  --text-lg: 1.125rem;     /* 18px */
  --text-xl: 1.25rem;      /* 20px */
  --text-2xl: 1.5rem;      /* 24px */
  --text-3xl: 1.875rem;    /* 30px */
  --text-4xl: 2.25rem;     /* 36px */

  /* Font Weight */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* Line Height */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;
}
```

**폰트 설치:**
```bash
# Pretendard (한국어 최적화 웹폰트, 무료)
# next.config.js 또는 layout.tsx에서 CDN 로드

# 방법 1: CDN
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" rel="stylesheet" />

# 방법 2: next/font (권장)
import localFont from 'next/font/local';
const pretendard = localFont({
  src: '../fonts/PretendardVariable.woff2',
  variable: '--font-pretendard',
});
```

### 2.3 간격 시스템 (Spacing)

```
Tailwind CSS 기본 간격 시스템 사용:
- 4px 단위 (p-1 = 4px, p-2 = 8px, p-4 = 16px, ...)
- 컴포넌트 내부 패딩: p-4 (16px) ~ p-6 (24px)
- 컴포넌트 간 간격: gap-4 (16px) ~ gap-6 (24px)
- 섹션 간 간격: py-12 (48px) ~ py-16 (64px)
- 페이지 좌우 패딩: px-4 (모바일) ~ px-8 (데스크톱)
- 최대 너비: max-w-7xl (1280px)
```

### 2.4 그림자 & 둥글기

```css
/* 그림자 - Tailwind 기본값 사용 */
shadow-sm:  0 1px 2px rgba(0,0,0,0.05)     /* 카드 기본 */
shadow:     0 1px 3px rgba(0,0,0,0.1)       /* 카드 호버 */
shadow-md:  0 4px 6px rgba(0,0,0,0.1)       /* 드롭다운 */
shadow-lg:  0 10px 15px rgba(0,0,0,0.1)     /* 모달 */

/* 둥글기 */
rounded:     4px    /* 뱃지, 작은 요소 */
rounded-md:  6px    /* 버튼, 인풋 */
rounded-lg:  8px    /* 카드 */
rounded-xl:  12px   /* 큰 카드, 모달 */
rounded-2xl: 16px   /* 히어로 영역 */
```

---

## 3. 에셋 디렉토리 구조

```
public/
├── favicon.ico
├── apple-touch-icon.png
├── og-default.png               # 기본 OG 이미지
├── icons/
│   ├── logo.svg                 # 가로형 로고
│   ├── logo-icon.svg            # 아이콘형 로고
│   └── categories/              # 카테고리 아이콘 (Lucide 사용 시 불필요)
├── images/
│   ├── empty-search.svg         # 빈 상태: 검색 없음
│   ├── empty-projects.svg       # 빈 상태: 프로젝트 없음
│   ├── error-404.svg            # 404 에러
│   ├── error-500.svg            # 500 에러
│   └── hero-illustration.svg    # 랜딩 히어로
├── fonts/
│   └── PretendardVariable.woff2 # 웹폰트 (next/font 사용 시)
└── lottie/
    └── generating.json          # 생성 중 애니메이션
```

---

## 4. 무료 디자인 도구

| 도구 | 용도 | URL |
|------|------|-----|
| **Figma** | UI 디자인, 로고, 와이어프레임 | figma.com (무료 3파일) |
| **Canva** | OG 이미지, 배너, 소셜 이미지 | canva.com (무료) |
| **Lucide Icons** | UI 아이콘 세트 | lucide.dev (MIT) |
| **unDraw** | 일러스트레이션 | undraw.co (MIT) |
| **LottieFiles** | 애니메이션 | lottiefiles.com (무료 선택) |
| **RealFaviconGenerator** | 파비콘 생성 | realfavicongenerator.net |
| **SimpleIcons** | 브랜드/서비스 아이콘 | simpleicons.org (CC0) |
| **Coolors** | 컬러 팔레트 생성 | coolors.co (무료) |
| **Google Fonts** | 웹폰트 | fonts.google.com |

---

## 5. 에셋 제작 우선순위

### Sprint 1 시작 전 (필수)
- [ ] 로고 (간단한 텍스트 로고도 가능, 나중에 개선)
- [ ] 파비콘
- [ ] 컬러 팔레트 확정 (위 CSS 변수 기준)
- [ ] Pretendard 폰트 설정

### Sprint 2~3 중 (카탈로그/빌더)
- [ ] 카테고리 아이콘 매핑 확정
- [ ] API 서비스 로고 수집 (사용하는 API별)
- [ ] 빈 상태 일러스트

### Sprint 8 (출시 전)
- [ ] OG 이미지
- [ ] 히어로 일러스트
- [ ] 생성 중 Lottie 애니메이션
- [ ] 에러 페이지 일러스트
