/**
 * featureExtractor.ts
 *
 * 사용자 컨텍스트(서비스 설명)에서 검증 가능한 기능 목록을 추출한다.
 * P3-1: Feature 타입 정의 및 extractFeatures() 함수
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VerifiableBy =
  | 'input+button'
  | 'chart-element'
  | 'list'
  | 'filter-button'
  | 'text-display'
  | 'unknown';

export interface Feature {
  featureId: string;
  description: string;
  verifiableBy: VerifiableBy;
}

// ---------------------------------------------------------------------------
// Keyword → verifiableBy mapping
// ---------------------------------------------------------------------------

interface KeywordRule {
  keywords: string[];
  verifiableBy: VerifiableBy;
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    keywords: ['검색', '조회', '찾기', '입력', 'search', 'query', 'lookup', 'find'],
    verifiableBy: 'input+button',
  },
  {
    keywords: ['차트', '그래프', '통계', '시각화', 'chart', 'graph', 'visualization', 'analytics'],
    verifiableBy: 'chart-element',
  },
  {
    keywords: ['목록', '리스트', '피드', '카드', 'list', 'feed', 'cards', 'items', '아이템'],
    verifiableBy: 'list',
  },
  {
    keywords: ['필터', '탭', '분류', '카테고리', 'filter', 'tab', 'category', 'sort'],
    verifiableBy: 'filter-button',
  },
  {
    keywords: ['표시', '보기', '정보', '날씨', '환율', '뉴스', 'display', 'show', 'info', 'weather', 'news'],
    verifiableBy: 'text-display',
  },
];

// ---------------------------------------------------------------------------
// extractFeatures
// ---------------------------------------------------------------------------

/**
 * 서비스 설명 텍스트에서 기능 목록을 추출한다.
 *
 * @param description 사용자가 입력한 서비스 설명
 * @returns Feature 배열 (최소 1개 — 알 수 없는 경우 'unknown' 포함)
 */
export function extractFeatures(description: string): Feature[] {
  const lower = description.toLowerCase();
  const features: Feature[] = [];
  const seen = new Set<VerifiableBy>();

  for (const rule of KEYWORD_RULES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword) && !seen.has(rule.verifiableBy)) {
        seen.add(rule.verifiableBy);
        features.push({
          featureId: `feature-${rule.verifiableBy}-${features.length + 1}`,
          description: `${keyword} 기능`,
          verifiableBy: rule.verifiableBy,
        });
        break;
      }
    }
  }

  // 아무것도 매칭되지 않은 경우 fallback
  if (features.length === 0) {
    features.push({
      featureId: 'feature-unknown-1',
      description: '기능 불명확',
      verifiableBy: 'unknown',
    });
  }

  return features;
}
