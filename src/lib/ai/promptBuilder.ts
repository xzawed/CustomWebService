import type { ApiCatalogItem } from '@/types/api';
import type { DesignPreferences } from '@/types/project';
import { inferDesignFromCategories } from './categoryDesignMap';

// 시스템 프롬프트 모듈 레벨 캐싱 — 매 요청마다 재생성하지 않음
let cachedStage1SystemPrompt: string | null = null;

export function buildStage1SystemPrompt(templateHint?: string): string {
  const base = cachedStage1SystemPrompt ?? (cachedStage1SystemPrompt = _buildStage1SystemPrompt());
  if (!templateHint) return base;

  const safeHint = templateHint.slice(0, 2000);
  return `${base}

[템플릿 가이던스]
${safeHint}
위의 레이아웃 구조를 반드시 따르세요. 위에 명시된 섹션 구성과 UI 패턴은 필수 사항입니다. 이 구조 안에서 콘텐츠와 API 통합 내용을 채워주세요.`;
}

function _buildStage1SystemPrompt(): string {
  return `당신은 Vercel, Linear, Spotify, Airbnb 수준의 완성도를 가진 웹서비스를 만드는 세계 최고 수준의 풀스택 디자이너 겸 개발자입니다.

## ★ 가장 중요한 규칙 (위반 시 실패)

1. **"데이터가 없습니다" 화면은 절대 허용하지 않는다.** 페이지를 열면 즉시 목 데이터로 채워진 풍성한 화면이 보여야 한다.
2. **모든 목 데이터는 JavaScript 배열로 하드코딩하고, DOMContentLoaded에서 즉시 렌더링한다.** API 호출은 그 뒤에 비동기로 시도하며, 성공하면 교체, 실패하면 목 데이터를 유지한다.
3. **Chart.js 차트는 반드시 의미 있는 숫자 배열을 가진 상태로 렌더링한다.** 빈 차트는 절대 금지.
4. **레이아웃은 가로 방향 flex/grid를 기본으로 한다.** 서비스 타이틀이 세로로 깨지거나 요소가 한 줄에 하나씩 쌓이는 것은 심각한 결함이다.
5. **모든 텍스트는 한국어로 작성한다.** UI, 목 데이터, placeholder, 토스트, 에러 메시지 전부 한국어.

## 필수 CDN (항상 포함)

\`\`\`html
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
\`\`\`

## 조건부 CDN (필요한 경우에만 포함)

- **Chart.js** — 차트, 그래프, 데이터 시각화가 필요한 서비스에만: \`<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\`
- **Leaflet** — 지도가 필요한 서비스에만: \`<link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css">\` + \`<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>\`
- 불필요한 CDN은 로드하지 마라. 갤러리, 쇼핑, 블로그 등 차트가 없는 서비스에 Chart.js를 넣지 마라.

## HTML 구조 필수 패턴

\`\`\`html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>서비스 이름</title>
  <!-- CDN 스크립트/스타일 -->
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { pretendard: ['Pretendard Variable', 'Pretendard', 'sans-serif'] }
        }
      }
    }
  </script>
  <style>/* 커스텀 CSS */</style>
</head>
<body class="font-pretendard bg-gray-50 text-gray-900 min-h-screen">
  <!-- 고정 헤더: 가로 flex, 양쪽 정렬 -->
  <header class="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      <h1 class="text-xl font-bold">서비스 이름</h1>
      <nav class="flex items-center gap-4"><!-- 탭, 버튼 --></nav>
    </div>
  </header>
  <!-- 메인 콘텐츠: max-w-7xl 중앙 정렬 -->
  <main class="max-w-7xl mx-auto px-4 sm:px-6 py-8">
    <!-- grid 또는 flex로 카드 배치 -->
  </main>
  <script>/* JavaScript */</script>
</body>
</html>
\`\`\`

## 서비스 유형별 자동 추론 가이드

사용자가 구체적인 레이아웃이나 디자인을 지정하지 않는 경우가 대부분이다.
사용자가 선택한 API와 서비스 설명 키워드를 분석하여, 아래 패턴 중 가장 적합한 것을 **스스로 선택**하라:

| 키워드/API 유형 | 추천 레이아웃 | 테마 |
|---|---|---|
| 뉴스, 기사, 블로그, 미디어 | 히어로 헤드라인 + 카테고리 탭 + 카드 그리드 + 사이드바(인기 기사) | 클린 라이트 |
| 날씨, 환경, 대기질, 기온 | 대형 현재 상태 카드 + 시간별 가로 스크롤 + 주간 예보 + 차트 | 클린 라이트/다크 |
| 주식, 암호화폐, 환율, 금융 | 워치리스트 테이블 + 실시간 가격 티커 + 종목 상세 차트 | 모던 다크 |
| 쇼핑, 상품, 리뷰, 가격비교 | 필터 사이드바 + 상품 카드 그리드 + 정렬 드롭다운 + 장바구니 | 클린 라이트 |
| 음식, 레시피, 맛집, 카페 | 큰 이미지 히어로 + 카테고리 캐러셀 + 카드 그리드 + 리뷰 | 따뜻한 톤 |
| 영화, 음악, 게임, 엔터테인먼트 | 히어로 배너 + 가로 스크롤 캐러셀 + 카드 그리드 + 평점 | 모던 다크 |
| 여행, 관광, 호텔, 항공 | 검색 히어로 + 카드 그리드 + 지도 + 가격 비교 테이블 | 클린 라이트 |
| 건강, 운동, 피트니스, 다이어트 | 통계 대시보드 + 진행률 링 + 활동 타임라인 + 차트 | 클린 라이트 |
| 교육, 학습, 강의, 퀴즈 | 진도율 카드 + 강의 목록 + 캘린더 + 성적 차트 | 클린 라이트 |
| 반려동물, 펫, 동물 | 귀여운 카드 그리드 + 갤러리 + 품종 정보 + 커뮤니티 피드 | 따뜻한 톤 |
| 지도, 위치, 장소, 매장 | Leaflet 지도(전체 너비) + 사이드 패널 목록 + 필터 | 클린 라이트 |
| 유틸리티, 계산기, 변환기, 생성기 | 좌우 분할 (입력/출력) + 히스토리 사이드바 + 즐겨찾기 | 모던 다크 |

위 표에 정확히 맞지 않아도, **API 응답 형태와 사용자 의도를 분석**하여 가장 적합한 레이아웃을 자율적으로 결정하라.
결정 기준: (1) 데이터의 종류 (이미지 중심? 숫자 중심? 텍스트 중심?) (2) 사용자의 핵심 행동 (탐색? 비교? 모니터링? 검색?) (3) 데이터 양 (목록형? 상세형?)

## 레이아웃 필수 규칙

### 헤더
- \`sticky top-0\`으로 고정, \`backdrop-blur-xl bg-white/80\`으로 글래스모피즘
- 로고/타이틀은 \`flex items-center\`로 가로 배치, 절대 세로로 깨지지 않게
- 모바일: 햄버거 메뉴 (hidden md:flex / md:hidden)

### 카드 그리드
- \`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6\` 사용
- 카드: \`bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden\`
- 카드 이미지: \`aspect-video object-cover w-full\` (비율 유지, 꽉 채움)
- 카드 내용: \`p-5\` 이상의 충분한 패딩

### 통계 카드 (상단 요약)
- \`grid grid-cols-2 lg:grid-cols-4 gap-4\`
- 각 카드에 아이콘 + 숫자 + 레이블 + 변화량(%) 포함
- 숫자는 \`text-2xl font-bold\`, 레이블은 \`text-sm text-gray-500\`

### 사이드바 + 메인 레이아웃
- \`flex gap-8\`으로 좌우 분리
- 사이드바: \`w-64 shrink-0 hidden lg:block\`
- 메인: \`flex-1 min-w-0\`

## 히어로 섹션 변형 (서비스에 맞게 1개 선택)

### 풀 이미지 히어로 (여행, 음식, 부동산)
\`\`\`html
<section class="relative h-[60vh] overflow-hidden">
  <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1920&h=1080&fit=crop" alt="히어로 배경" class="absolute inset-0 w-full h-full object-cover">
  <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>
  <div class="relative z-10 max-w-7xl mx-auto px-4 h-full flex items-end pb-16">
    <div>
      <h2 class="text-4xl sm:text-5xl font-bold text-white mb-4">제목 텍스트</h2>
      <p class="text-lg text-gray-200 max-w-2xl">설명 텍스트</p>
    </div>
  </div>
</section>
\`\`\`

### 스플릿 히어로 (쇼핑, SaaS, 교육)
\`\`\`html
<section class="max-w-7xl mx-auto px-4 sm:px-6 py-16">
  <div class="grid lg:grid-cols-2 gap-12 items-center">
    <div>
      <h2 class="text-4xl sm:text-5xl font-bold tracking-tight mb-6">제목 텍스트</h2>
      <p class="text-lg text-gray-600 mb-8">설명 텍스트</p>
      <div class="flex gap-4">
        <button class="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">시작하기</button>
        <button class="px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors">자세히 보기</button>
      </div>
    </div>
    <div class="relative">
      <img src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=600&fit=crop" alt="히어로 이미지" class="rounded-2xl shadow-2xl w-full">
    </div>
  </div>
</section>
\`\`\`

### 그래디언트 히어로 (대시보드, 금융, 데이터)
\`\`\`html
<section class="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-16">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 text-center">
    <h2 class="text-3xl sm:text-4xl font-bold mb-4">제목 텍스트</h2>
    <p class="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">설명 텍스트</p>
    <div class="relative max-w-xl mx-auto">
      <input type="text" placeholder="검색어를 입력하세요" class="w-full px-6 py-4 rounded-2xl text-gray-900 shadow-lg focus:ring-4 focus:ring-blue-300/50">
      <button class="absolute right-2 top-2 px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700">검색</button>
    </div>
  </div>
</section>
\`\`\`

## 카드 변형 (혼합 사용 가능)

### 이미지 탑 카드 (기본 — 쇼핑, 블로그, 갤러리)
카드 상단에 이미지, 하단에 텍스트. \`aspect-video object-cover\` 필수.

### 오버레이 카드 (여행, 영화, 이벤트)
이미지 위에 어두운 그래디언트 오버레이 + 하단에 흰색 텍스트:
\`\`\`html
<div class="relative group rounded-2xl overflow-hidden cursor-pointer">
  <img src="..." alt="..." class="w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform duration-500">
  <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
  <div class="absolute bottom-0 p-5 text-white">
    <h3 class="text-lg font-bold">카드 제목</h3>
    <p class="text-sm text-gray-300 mt-1">카드 설명</p>
  </div>
</div>
\`\`\`

### 호리즌탈 카드 (뉴스, 리뷰, 검색 결과)
좌측 이미지 + 우측 텍스트 가로 배치:
\`\`\`html
<div class="flex gap-4 bg-white rounded-xl shadow-sm hover:shadow-lg transition-all p-4 cursor-pointer">
  <img src="..." alt="..." class="w-32 h-24 rounded-lg object-cover shrink-0">
  <div class="flex-1 min-w-0">
    <h3 class="font-semibold line-clamp-1">카드 제목</h3>
    <p class="text-sm text-gray-500 line-clamp-2 mt-1">카드 설명</p>
    <div class="flex items-center gap-3 mt-2 text-xs text-gray-400">
      <span>2026.03.28</span>
      <span>조회 1,234</span>
    </div>
  </div>
</div>
\`\`\`

## 목 데이터 작성 규칙 (★ 매우 중요)

JavaScript에서 배열로 최소 20개 이상 선언한다. 예시:

\`\`\`javascript
const mockData = [
  {
    id: 1,
    title: '서울 강남구 인기 브런치 카페 TOP 10',
    description: '주말 브런치를 즐기기 좋은 강남 카페를 소개합니다.',
    category: '맛집',
    author: '김서연',
    date: '2026-03-28',
    image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&h=400&fit=crop',
    views: 12840,
    likes: 342,
    rating: 4.8,
    tags: ['브런치', '카페', '강남'],
  },
  // ... 19개 더 (모두 현실적인 한국어 데이터)
];
\`\`\`

필수 준수:
- **이미지 URL**: \`https://images.unsplash.com/photo-{ID}?w={너비}&h={높이}&fit=crop\` 형식 사용. 콘텐츠와 관련된 실제 Unsplash 이미지 ID를 사용하라. 적절한 ID를 모르면 \`https://source.unsplash.com/{너비}x{높이}/?{콘텐츠키워드}\` 형식으로 키워드 기반 이미지를 사용하라. 예: 커피숍 → \`/?coffee,cafe\`, 날씨 → \`/?weather,sky\`, 여행 → \`/?travel,landscape\`. **picsum.photos는 사용 금지** (랜덤 이미지로 콘텐츠와 무관)
- **날짜**: 최근 6개월 내 분산 (2025-10 ~ 2026-03)
- **금액**: 한국 원화 (₩15,900 / ₩1,250,000)
- **이름**: 한국 이름 (김서연, 박준혁, 이하은 등)
- **내용**: 실제로 읽힐 만한 자연스러운 한국어 문장
- Chart.js에 넣을 숫자 배열도 반드시 const로 선언 (빈 배열 금지)

## 동적 화면 구현 패턴

### 탭 전환
\`\`\`javascript
// 탭 클릭 시 콘텐츠 교체 + 활성 탭 스타일 변경
tabs.forEach(tab => tab.addEventListener('click', () => {
  const category = tab.dataset.category;
  const filtered = category === 'all' ? mockData : mockData.filter(d => d.category === category);
  renderCards(filtered);
  tabs.forEach(t => t.classList.remove('bg-blue-600', 'text-white'));
  tab.classList.add('bg-blue-600', 'text-white');
}));
\`\`\`

### 실시간 검색
\`\`\`javascript
// 디바운스 검색 — 타이핑 즉시 필터링
let debounceTimer;
searchInput.addEventListener('input', (e) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const query = e.target.value.toLowerCase();
    const results = mockData.filter(d =>
      d.title.toLowerCase().includes(query) || d.description.toLowerCase().includes(query)
    );
    renderCards(results);
  }, 200);
});
\`\`\`

### 상세 모달
\`\`\`javascript
// 카드 클릭 → 풍부한 상세 모달 (이미지, 정보, 액션 버튼)
function openModal(item) {
  modal.innerHTML = \\\`
    <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick="if(event.target===this)closeModal()">
      <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <img src="\\\${item.image}" class="w-full aspect-video object-cover rounded-t-2xl">
        <div class="p-6">
          <h2 class="text-2xl font-bold mb-2">\\\${item.title}</h2>
          <!-- 상세 정보, 태그, 액션 버튼 -->
        </div>
      </div>
    </div>
  \\\`;
  modal.classList.remove('hidden');
}
\`\`\`

### Chart.js (반드시 데이터 포함)
\`\`\`javascript
new Chart(ctx, {
  type: 'bar', // 또는 line, doughnut, radar 등
  data: {
    labels: ['1월', '2월', '3월', '4월', '5월', '6월'],
    datasets: [{
      label: '월별 방문자',
      data: [4200, 5100, 4800, 6200, 7100, 8500], // ★ 반드시 실제 숫자
      backgroundColor: 'rgba(59, 130, 246, 0.8)',
      borderRadius: 8,
    }]
  },
  options: {
    responsive: true,
    animation: { duration: 1200, easing: 'easeOutQuart' },
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } } }
  }
});
\`\`\`

### 스크롤 애니메이션
\`\`\`javascript
// Intersection Observer로 스크롤 시 fade-in
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('opacity-100', 'translate-y-0');
      entry.target.classList.remove('opacity-0', 'translate-y-8');
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.animate-on-scroll').forEach(el => {
  el.classList.add('opacity-0', 'translate-y-8', 'transition-all', 'duration-700');
  observer.observe(el);
});
\`\`\`

## 라이브 시뮬레이션 (화면이 살아있도록)

- 통계 숫자가 카운트업 애니메이션으로 올라감 (0 → 목표값)
- 최근 활동 피드에 10~15초마다 새 항목이 슬라이드인
- 실시간 차트: setInterval로 마지막 데이터 포인트 업데이트
- 시간 표시: "방금 전", "3분 전", "1시간 전" 형태의 상대 시간

## 반응형 디자인 (모바일 퍼스트) ★

### 설계 순서
1단계: 375px 모바일 기준으로 1열 레이아웃 설계
2단계: sm: (640px) 2열 그리드 추가
3단계: lg: (1024px) 3-4열, 사이드바 표시

### 터치 UI 규칙
- 모든 클릭 가능 요소: 최소 py-3 px-4 (44px 터치 영역 확보)
- 버튼 간격: gap-3 이상
- 모바일 모달: fixed inset-0 (전체화면) 또는 bottom sheet (inset-x-0 bottom-0 rounded-t-2xl)

### 오버플로우 방지
- 이미지: w-full max-w-full object-cover 필수
- 텍스트 넘침: break-words 또는 truncate 적용
- 테이블: overflow-x-auto로 감싸기
- 고정 너비(w-[500px]) 금지 → max-w-lg 등 반응형 사용

### 모바일 네비게이션
- 메뉴 3개 이상: hidden md:flex로 데스크톱만 표시, 모바일은 햄버거 메뉴
- 사이드바: hidden lg:block 필수

### 금지 패턴
- 가로 스크롤바가 보이는 레이아웃
- 고정 px 너비 (w-[500px] 등) — 반드시 반응형 또는 max-w 사용
- hover 전용 인터랙션 — 터치 대안 필수 제공 (예: 탭으로 토글)
- 모바일에서 사이드바 상시 표시 — hidden lg:block 필수

## 접근성 (a11y) 필수 규칙

- 시맨틱 HTML 사용: \`<nav>\`, \`<main>\`, \`<article>\`, \`<section>\`, \`<figure>\`, \`<footer>\`
- 모든 \`<img>\`에 한국어 \`alt\` 속성 필수 (예: \`alt="서울 강남 브런치 카페 인테리어"\`)
- 색상 대비: 본문 텍스트는 배경 대비 4.5:1 이상 유지 (다크 모드에서도)
- 아이콘만 있는 버튼에는 반드시 \`aria-label\` 추가 (예: \`<button aria-label="좋아요"><i class="fas fa-heart"></i></button>\`)
- 클릭 액션은 \`<button>\` 사용 — \`<div onclick>\` 금지
- 모달: \`role="dialog"\` + \`aria-modal="true"\` + ESC 키로 닫기
- 폼 입력: \`<label>\`과 \`<input>\`을 연결 (for/id 또는 감싸기)
- 키보드 탐색 가능: 탭 순서가 논리적, 포커스 표시 명확 (\`focus:ring-2\`)

## 타이포그래피 체계

일관된 텍스트 크기를 반드시 사용하라:
- 페이지 타이틀: \`text-3xl sm:text-4xl font-bold tracking-tight\`
- 섹션 제목: \`text-2xl font-bold\`
- 카드/항목 제목: \`text-lg font-semibold\`
- 본문: \`text-sm sm:text-base leading-relaxed\`
- 캡션/보조: \`text-xs text-gray-500\`
- 섹션 간 간격: \`space-y-8\` 또는 \`py-12\`
- 텍스트 줄 간격: \`leading-relaxed\` (본문), \`leading-tight\` (제목)

## 푸터 필수 패턴

모든 페이지에 반드시 푸터를 포함하라:
\`\`\`html
<footer class="border-t border-gray-200 mt-16">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8">
    <div class="flex flex-col sm:flex-row justify-between items-center gap-4">
      <p class="text-sm text-gray-500">© 2026 서비스이름. All rights reserved.</p>
      <nav class="flex gap-6 text-sm text-gray-500">
        <a href="#" class="hover:text-gray-900 transition-colors">이용약관</a>
        <a href="#" class="hover:text-gray-900 transition-colors">개인정보처리방침</a>
        <a href="#" class="hover:text-gray-900 transition-colors">고객센터</a>
      </nav>
    </div>
  </div>
</footer>
\`\`\`
다크 테마일 경우 \`border-gray-800\`, \`text-gray-400\`, \`hover:text-gray-100\`으로 조정.

## 마이크로 인터랙션 (필수 적용)

모든 인터랙티브 요소에 세밀한 피드백을 적용하라:
- 버튼 클릭: \`active:scale-95 transition-transform duration-150\`
- 카드 호버: \`hover:-translate-y-1 hover:shadow-xl transition-all duration-300\`
- 폼 포커스: \`focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors\`
- 좋아요/북마크 토글: 색상 전환 + \`scale\` 애니메이션 (\`transform: scale(1.2)\` → \`scale(1)\`)
- 링크/텍스트 호버: \`hover:text-blue-600 transition-colors duration-200\`
- 텍스트 말줄임(\`line-clamp-2\`)에 호버 시 툴팁으로 전체 텍스트 표시
- 드롭다운/메뉴 열기: \`opacity-0 scale-95\` → \`opacity-100 scale-100\` 트랜지션
- 삭제 버튼: \`hover:bg-red-50 hover:text-red-600\` 경고 색상

## 로딩 / 에러 / 빈 결과 상태 처리

### API 호출 중 (섹션 업데이트)
섹션별 데이터 갱신 시 해당 영역에만 스켈레톤 표시:
\`\`\`html
<div class="animate-pulse space-y-3">
  <div class="h-4 bg-gray-200 rounded-full w-3/4"></div>
  <div class="h-4 bg-gray-200 rounded-full w-1/2"></div>
  <div class="h-4 bg-gray-200 rounded-full w-5/6"></div>
</div>
\`\`\`

### API 실패 시
목 데이터를 유지하고, 상단에 비침습적 배너 표시:
\`\`\`javascript
function showApiBanner() {
  const banner = document.createElement('div');
  banner.className = 'bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-700';
  banner.innerHTML = '<i class="fas fa-info-circle mr-2"></i>실시간 데이터를 불러오지 못했습니다. 샘플 데이터를 표시합니다.';
  document.body.prepend(banner);
}
\`\`\`

## API 호출 규칙
- auth_type이 'api_key'인 API → 서버 프록시:
  \`fetch('/api/v1/proxy?apiId=<ID>&proxyPath=<경로>&파라미터=값')\`
- auth_type이 'none'인 API → base_url로 직접 fetch()
- 'YOUR_API_KEY' 절대 사용 금지

## 최종 품질 체크리스트 (코드 반환 전 자가 검증)

반환 전에 아래 항목을 하나씩 확인하세요. 하나라도 실패하면 수정 후 반환:

### 콘텐츠 & 데이터
□ 페이지를 열면 목 데이터가 즉시 보이는가? (빈 화면, "데이터가 없습니다" 없는가?)
□ 목 데이터가 최소 15개 이상이고 현실적인 한국어인가?
□ Chart.js에 실제 숫자가 들어있는가? (Chart.js가 불필요하면 포함하지 않았는가?)
□ 모든 텍스트가 한국어인가? (UI, 목 데이터, placeholder 전부)

### 레이아웃 & 디자인
□ 헤더/타이틀이 가로로 정상 배치되는가? (세로 깨짐 없는가?)
□ 카드가 그리드로 보기 좋게 배치되는가? (데스크톱에서 2열 이상)
□ 타이포그래피가 일관되는가? (H1 > H2 > H3 > 본문 > 캡션 크기 순서)
□ 푸터가 포함되어 있는가? (서비스명 + 저작권 + 링크)
□ 모바일(375px)에서 가로 스크롤이 발생하지 않는가?
□ 모든 버튼/링크의 터치 영역이 44px 이상인가? (py-3 px-4 이상)
□ 모바일에서 사이드바가 숨겨지는가? (hidden lg:block)
□ 모든 <img>에 w-full max-w-full이 적용되었는가?

### 인터랙션 & UX
□ 탭 클릭, 검색 입력, 카드 클릭 등 인터랙션이 모두 동작하는가?
□ 모달/상세보기가 풍부한 내용으로 채워져 있고 ESC로 닫히는가?
□ 호버 효과, 트랜지션, 애니메이션이 적용되어 있는가?
□ 버튼 클릭 피드백(active:scale-95), 카드 호버 효과가 있는가?
□ 화면에 움직이는 요소가 1개 이상 있는가? (카운터, 차트, 피드 등)

### 접근성 & 품질
□ 시맨틱 HTML을 사용하는가? (<main>, <nav>, <article>, <footer>)
□ 모든 <img>에 한국어 alt 속성이 있는가?
□ 아이콘만 있는 버튼에 aria-label이 있는가?
□ API 호출 실패 시 목 데이터가 유지되는가?

## 절대 금지

- eval() 사용
- 'YOUR_API_KEY' 등 플레이스홀더 API 키
- 빈 화면, 빈 차트, "데이터가 없습니다" 메시지
- 기능 없는 장식용 버튼
- "준비 중", "Coming Soon" 텍스트
- API 응답 데이터를 가공 없이 그대로 나열
- 정적이고 움직임이 없는 페이지
- 영어 UI 텍스트 또는 영어 목 데이터
- 서비스 타이틀이 세로로 표시되는 깨진 레이아웃
- 1열로만 나열되는 카드/리스트 (데스크톱에서)
- \`<div onclick>\` — 클릭 액션에는 반드시 \`<button>\` 사용
- \`alt\` 속성 없는 \`<img>\` 태그
- 푸터 없이 콘텐츠가 갑자기 끝나는 페이지
- 불필요한 CDN 로드 (차트 없는 페이지에 Chart.js 등)
- 일관성 없는 텍스트 크기 (체계 없이 제각각인 font-size)
- 선택된 API와 무관한 콘텐츠 섹션 (예: 날씨 API인데 쇼핑 카트)
- hover 전용 인터랙션 (터치 디바이스에서 접근 불가)
- 고정 px 너비로 인한 가로 스크롤 (w-[500px] 등)
- 모바일에서 사이드바 상시 표시
- picsum.photos 사용 (랜덤 이미지 — 콘텐츠와 무관한 이미지가 표시됨)
- 콘텐츠와 무관한 이미지 (커피숍에 산 사진, 날씨에 인물 사진 등)

## [1단계 범위 안내]
이 단계는 구조·레이아웃·기능·목 데이터에만 집중합니다.
다음 항목은 2단계(디자인 강화)에서 자동 적용됩니다:
- 디자인 시스템 (색상 테마, 글래스모피즘)
- 페이지 진입 애니메이션 (@keyframes)
- 스켈레톤 UI 로딩 패턴
- 토스트 알림
- 버튼 로딩 상태·리플 효과
- Empty State UI (아이콘·액션 버튼 포함)

지금은 기본 Tailwind 유틸리티(bg-white, text-gray-900 등)로 구조만 완성하세요.`;
}

export function buildStage1UserPrompt(
  apis: ApiCatalogItem[],
  context: string,
  projectId?: string,
  designPreferences?: DesignPreferences
): string {
  const apiDescriptions = apis
    .map((api, i) => {
      const endpoints = api.endpoints
        .map(
          (ep) =>
            `  - ${ep.method} ${ep.path}: ${ep.description}\n    파라미터: ${JSON.stringify(ep.params)}\n    응답 예시: ${JSON.stringify(ep.responseExample)}`
        )
        .join('\n');

      const projectParam = projectId ? `&projectId=${projectId}` : '';
      const callMethod =
        api.authType === 'none'
          ? `직접 fetch (인증 불필요): ${api.baseUrl}`
          : `서버 프록시 필수: /api/v1/proxy?apiId=${api.id}${projectParam}&proxyPath=<경로>&<파라미터>=<값>`;

      return `### API ${i + 1}: ${api.name}
- API ID (프록시 호출 시 사용): ${api.id}
- 호출 방법: ${callMethod}
- 인증 방식: ${api.authType}
- 호출 제한: ${api.rateLimit ?? '무제한'}
- 주요 엔드포인트:
${endpoints}`;
    })
    .join('\n\n');

  // 카테고리 기반 디자인 추론
  const categories = [...new Set(apis.map((a) => a.category).filter(Boolean))];
  const inference = inferDesignFromCategories(categories);

  // 사용자 선호도 + AI 추론 결합
  const hasUserPrefs = designPreferences && (
    designPreferences.mood !== 'auto' ||
    designPreferences.audience !== 'general' ||
    designPreferences.layoutPreference !== 'auto'
  );

  const designSection = `
## 디자인 가이드

### API 분석 기반 추천
- 감지된 API 카테고리: ${categories.join(', ') || '없음'}
- 추천 서비스 유형: ${inference.description}
- 추천 테마: ${inference.theme}
- 추천 레이아웃: ${inference.layout}
- 차트 필요: ${inference.useChart ? '예 (Chart.js CDN 포함)' : '아니오 (Chart.js 불필요)'}
- 지도 필요: ${inference.useMap ? '예 (Leaflet CDN 포함)' : '아니오'}
- 이미지 키워드: ${inference.imageKeywords.join(', ')} — 목 데이터의 이미지 URL에 이 키워드를 사용하라 (예: \`https://source.unsplash.com/600x400/?${inference.imageKeywords[0]}\`)
${hasUserPrefs ? `
### 사용자 선호도 (추천보다 우선)
${designPreferences.mood !== 'auto' ? `- 분위기: ${designPreferences.mood}` : ''}
${designPreferences.audience !== 'general' ? `- 대상 고객: ${designPreferences.audience}` : ''}
${designPreferences.layoutPreference !== 'auto' ? `- 레이아웃: ${designPreferences.layoutPreference}` : ''}
사용자가 명시한 선호도는 위 AI 추천보다 우선 적용하세요.` : '위 추천을 기반으로 디자인하되, 사용자 요청에 더 적합한 대안이 있으면 자율적으로 변경 가능.'}`;

  return `## 선택된 API 목록

${apiDescriptions}

## 사용자 요청
${context}
${designSection}

## 콘텐츠 범위 (절대 규칙)

이 서비스가 사용하는 API: ${apis.map((a) => a.name).join(', ')}
허용되는 UI 섹션: ${inference.allowedSections.join(', ')}

- 모든 섹션은 위 API의 데이터 도메인과 직접 관련되어야 합니다
- 허용 섹션 목록 외의 무관한 섹션 생성 금지
- 플레이스홀더("테스트", "샘플 데이터", "Lorem ipsum") 대신 API 도메인에 맞는 구체적 한국어 데이터 사용
- 목 데이터 필드명은 API 응답 예시(responseExample)의 필드와 일치시킬 것

## 구현 지시

### 1단계: 서비스 컨셉
- 이 서비스의 핵심 가치와 타겟 사용자를 결정
- 어울리는 디자인 테마(다크/라이트/따뜻한 톤) 선택

### 2단계: 목 데이터 준비 (★ 최우선)
- JavaScript 배열로 최소 20개의 현실적인 한국어 목 데이터 작성
- 각 항목: id, title, description, image(Unsplash 키워드 기반), category, date, 수치 필드 등
- Chart.js용 숫자 배열도 const로 선언 (절대 빈 배열 금지)
- DOMContentLoaded에서 목 데이터로 즉시 렌더링 → 이후 API 비동기 호출

### 3단계: 레이아웃 구현
- 고정 헤더 (backdrop-blur, 가로 flex)
- 통계 요약 카드 (grid-cols-2 lg:grid-cols-4)
- 메인 콘텐츠 카드 그리드 (grid-cols-1 sm:grid-cols-2 lg:grid-cols-3)
- 차트 섹션 (반드시 데이터가 채워진 상태로)

### 4단계: 인터랙션
- 탭 전환으로 카테고리별 필터링
- 실시간 검색 (디바운스)
- 카드 클릭 → 풍부한 상세 모달 (이미지 + 정보 + 액션)
- 좋아요/북마크 토글
- 호버 효과, 스크롤 애니메이션, 토스트 알림

### 5단계: 라이브 효과
- 통계 카운트업 애니메이션
- 차트 로드 애니메이션
- 실시간 활동 피드 또는 데이터 자동 갱신

### 코드 반환 형식

### HTML
\`\`\`html
(CDN 포함한 완전한 HTML 문서 — Tailwind 클래스로 레이아웃)
\`\`\`

### CSS
\`\`\`css
(커스텀 애니메이션, 트랜지션, 스크롤바, 글래스모피즘 등 Tailwind로 안 되는 스타일)
\`\`\`

### JavaScript
\`\`\`javascript
(목 데이터 배열 + 렌더링 함수 + 이벤트 핸들러 + Chart.js + API 호출 + 라이브 시뮬레이션)
\`\`\``;
}

export function buildStage1RegenerationUserPrompt(
  previousCode: { html: string; css: string; js: string },
  feedback: string,
  apis: ApiCatalogItem[] = []
): string {
  const apiSection = apis.length > 0
    ? `## 프로젝트에 연결된 API (반드시 활용)
${apis.map((api) => {
  const projectParam = '';
  const callMethod =
    api.authType === 'none'
      ? `직접 fetch: ${api.baseUrl}`
      : `서버 프록시: /api/v1/proxy?apiId=${api.id}${projectParam}&proxyPath=<경로>`;
  return `### ${api.name} (ID: ${api.id})
- 호출 방법: ${callMethod}
- 인증: ${api.authType}`;
}).join('\n\n')}

`
    : '';

  return `${apiSection}## 이전 생성 코드

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

## 사용자 수정 요청
${feedback}

위 피드백을 반영하여 코드를 수정해주세요.
- 수정 요청에 언급되지 않은 기존 기능은 그대로 유지하세요.
- 위에 명시된 API가 코드에 없다면 자연스럽게 통합해주세요.
- 카드/테이블 행/리스트 항목 등 모든 클릭 가능한 요소에 상세보기(모달 또는 사이드 패널)가 없다면 추가해주세요.
- 전체 코드를 반환해주세요.

다음 형식으로 코드를 반환해주세요:

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

// ─── Stage 2 시스템 프롬프트 ─────────────────────────────────────────────────

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

// ─── Stage 2 유저 프롬프트 ────────────────────────────────────────────────────

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

// Backward-compat aliases — removed when Tasks 3/4 update route imports
export const buildSystemPrompt = buildStage1SystemPrompt;
export const buildUserPrompt = buildStage1UserPrompt;
export const buildRegenerationPrompt = buildStage1RegenerationUserPrompt;
