export interface DesignInference {
  theme: string;
  layout: string;
  useChart: boolean;
  useMap: boolean;
  description: string;
  allowedSections: string[];
  imageKeywords: string[];
}

interface CategoryRule {
  categories: string[];
  theme: string;
  layout: string;
  useChart: boolean;
  useMap: boolean;
  description: string;
  allowedSections: string[];
  imageKeywords: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    categories: ['finance'],
    theme: 'modern-dark',
    layout: 'watchlist-table-chart',
    useChart: true,
    useMap: false,
    description: '금융/투자 서비스 — 워치리스트 테이블 + 실시간 차트 + 종목 상세',
    allowedSections: ['종목 워치리스트', '실시간 가격 차트', '시장 뉴스 피드', '포트폴리오 요약', '종목 상세 모달'],
    imageKeywords: ['stock market', 'finance', 'trading', 'business graph', 'investment'],
  },
  {
    categories: ['weather'],
    theme: 'ocean-blue',
    layout: 'status-card-chart',
    useChart: true,
    useMap: false,
    description: '날씨/환경 서비스 — 대형 현재 상태 카드 + 시간별 스크롤 + 주간 예보 차트',
    allowedSections: ['현재 날씨 카드', '시간별 예보 스크롤', '주간 예보 그리드', '대기질/자외선 차트', '날씨 알림 배너'],
    imageKeywords: ['weather', 'sky', 'clouds', 'sunrise', 'rain'],
  },
  {
    categories: ['entertainment', 'fun'],
    theme: 'sunset-gradient',
    layout: 'hero-carousel-grid',
    useChart: false,
    useMap: false,
    description: '엔터테인먼트 서비스 — 히어로 배너 + 가로 캐러셀 + 카드 그리드',
    allowedSections: ['인기 콘텐츠 히어로 배너', '장르별 가로 캐러셀', '트렌딩 카드 그리드', '콘텐츠 상세 모달', '리뷰/평점 섹션'],
    imageKeywords: ['entertainment', 'movie', 'music', 'concert', 'game'],
  },
  {
    categories: ['news', 'social'],
    theme: 'clean-light',
    layout: 'hero-tabs-grid-sidebar',
    useChart: false,
    useMap: false,
    description: '뉴스/미디어 서비스 — 히어로 헤드라인 + 카테고리 탭 + 카드 그리드 + 사이드바',
    allowedSections: ['헤드라인 히어로', '카테고리 탭 네비게이션', '기사 카드 그리드', '인기 기사 사이드바', '속보 알림 배너'],
    imageKeywords: ['newspaper', 'news', 'journalist', 'press', 'media'],
  },
  {
    categories: ['tourism', 'lifestyle'],
    theme: 'warm',
    layout: 'hero-image-carousel-grid',
    useChart: false,
    useMap: false,
    description: '여행/라이프스타일 서비스 — 큰 이미지 히어로 + 캐러셀 + 카드 그리드',
    allowedSections: ['여행지 히어로 이미지', '추천 여행지 캐러셀', '여행지 카드 그리드', '여행 후기 섹션', '예약/상세 모달'],
    imageKeywords: ['travel', 'landscape', 'beach', 'city', 'hotel'],
  },
  {
    categories: ['maps', 'location', 'transport', 'realestate'],
    theme: 'clean-light',
    layout: 'map-with-sidebar',
    useChart: false,
    useMap: true,
    description: '지도/위치 서비스 — Leaflet 전체 너비 지도 + 사이드 패널 목록 + 필터',
    allowedSections: ['전체 너비 지도', '장소 목록 사이드 패널', '필터/검색 바', '장소 상세 카드', '경로/거리 정보'],
    imageKeywords: ['map', 'city', 'building', 'road', 'architecture'],
  },
  {
    categories: ['science', 'data'],
    theme: 'modern-dark',
    layout: 'dashboard-stats-chart',
    useChart: true,
    useMap: false,
    description: '데이터/과학 서비스 — 통계 대시보드 + 차트 + 데이터 테이블',
    allowedSections: ['통계 요약 카드', '데이터 차트 섹션', '데이터 테이블', '필터/검색 패널', '상세 분석 모달'],
    imageKeywords: ['data', 'science', 'technology', 'laboratory', 'research'],
  },
  {
    categories: ['image'],
    theme: 'monochrome',
    layout: 'gallery-masonry',
    useChart: false,
    useMap: false,
    description: '이미지/갤러리 서비스 — 그리드 갤러리 + 필터 + 상세 모달',
    allowedSections: ['갤러리 그리드', '카테고리 필터 바', '이미지 상세 모달', '인기/최신 탭', '이미지 정보 오버레이'],
    imageKeywords: ['photography', 'art', 'gallery', 'creative', 'design'],
  },
  {
    categories: ['utility', 'dictionary', 'translation'],
    theme: 'modern-dark',
    layout: 'split-input-output',
    useChart: false,
    useMap: false,
    description: '유틸리티/도구 서비스 — 좌우 분할 (입력/출력) + 히스토리 사이드바',
    allowedSections: ['입력 패널', '결과/출력 패널', '변환 히스토리', '자주 사용 목록', '도움말/예시 섹션'],
    imageKeywords: ['tool', 'workspace', 'keyboard', 'productivity', 'office'],
  },
];

const DEFAULT_INFERENCE: DesignInference = {
  theme: 'clean-light',
  layout: 'hero-tabs-grid',
  useChart: false,
  useMap: false,
  description: '일반 서비스 — 히어로 + 탭 + 카드 그리드 (기본 레이아웃)',
  allowedSections: ['히어로 섹션', '카테고리 탭', '콘텐츠 카드 그리드', '통계 요약', '상세 모달'],
  imageKeywords: ['service', 'technology', 'modern', 'digital', 'abstract'],
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
        allowedSections: rule.allowedSections,
        imageKeywords: rule.imageKeywords,
      };
    }
  }

  return DEFAULT_INFERENCE;
}
