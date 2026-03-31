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
