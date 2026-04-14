export interface PopularService {
  id: string;
  title: string;
  description: string;
  context: string;
  apiNames: string[];
  apiIds: string[];
  category: string;
  usageCount: number;
}

export const CURATED_SERVICES: Omit<PopularService, 'apiIds' | 'usageCount'>[] = [
  {
    id: 'curated-weather-dashboard',
    title: '실시간 날씨 대시보드',
    description: '현재 위치의 날씨, 미세먼지, 자외선 지수를 한눈에 보여주는 대시보드',
    context:
      '현재 위치 기반으로 실시간 날씨 정보와 미세먼지 농도, 자외선 지수를 카드형 대시보드로 보여주는 서비스를 만들고 싶어요. 시간별 예보와 주간 예보도 차트로 표시하고, 날씨에 따라 배경 색상이 변하면 좋겠어요.',
    apiNames: ['OpenWeatherMap', 'Air Quality'],
    category: 'weather',
  },
  {
    id: 'curated-exchange-calculator',
    title: '환율 계산기 & 트렌드',
    description: '실시간 환율 조회와 변환, 최근 환율 추이를 차트로 확인',
    context:
      '주요 통화(USD, EUR, JPY, CNY 등)의 실시간 환율을 조회하고 금액을 변환할 수 있는 계산기를 만들고 싶어요. 최근 30일 환율 변동 추이를 Chart.js 라인 차트로 보여주고, 즐겨찾기 통화 쌍을 설정할 수 있으면 좋겠어요.',
    apiNames: ['Exchange Rate', 'Currency'],
    category: 'finance',
  },
  {
    id: 'curated-news-feed',
    title: '뉴스 피드 & 요약',
    description: '카테고리별 최신 뉴스를 카드 피드로 모아보는 서비스',
    context:
      '경제, IT, 스포츠, 세계 등 카테고리별 최신 뉴스를 카드형 피드로 보여주는 서비스를 만들고 싶어요. 각 뉴스 카드에는 제목, 요약, 이미지, 출처가 표시되고, 카테고리 탭으로 전환할 수 있으면 좋겠어요.',
    apiNames: ['News API', 'Naver News'],
    category: 'news',
  },
  {
    id: 'curated-travel-planner',
    title: '여행지 탐색 & 관광 정보',
    description: '지도 기반으로 관광 명소, 맛집, 숙소를 탐색하는 서비스',
    context:
      '지도 위에 관광 명소, 맛집, 숙소 정보를 마커로 표시하고, 클릭하면 상세 정보가 팝업으로 나오는 여행지 탐색 서비스를 만들고 싶어요. 지역별 필터와 카테고리 필터가 있으면 좋겠어요.',
    apiNames: ['Korea Tourism', 'Kakao Map'],
    category: 'tourism',
  },
  {
    id: 'curated-language-tool',
    title: '번역기 & 사전 검색',
    description: '다국어 번역과 단어 뜻풀이를 한 화면에서 사용하는 도구',
    context:
      '텍스트를 입력하면 여러 언어로 동시에 번역해주고, 단어를 클릭하면 사전에서 뜻풀이와 예문을 보여주는 언어 도구를 만들고 싶어요. 최근 검색 히스토리도 보여주면 좋겠어요.',
    apiNames: ['Papago Translation', 'Korean Dictionary'],
    category: 'translation',
  },
];

/**
 * usageRows에서 상위 topN개 api_id를 빈도순으로 추출한다.
 */
export function pickTopIds(
  usageRows: Array<{ apiId: string; context: string }>,
  topN: number
): string[] {
  const counts = new Map<string, number>();
  for (const { apiId } of usageRows) {
    counts.set(apiId, (counts.get(apiId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id]) => id);
}

/**
 * usageRows + API 상세 정보로 PopularService 목록을 만든다.
 */
export function computePopularServices(
  usageRows: Array<{ apiId: string; context: string }>,
  apiDetails: Array<{ id: string; name: string; description?: string | null; category?: string | null }>
): PopularService[] {
  const counts = new Map<string, number>();
  const contexts = new Map<string, string>();
  for (const { apiId, context } of usageRows) {
    counts.set(apiId, (counts.get(apiId) ?? 0) + 1);
    if (!contexts.has(apiId)) contexts.set(apiId, context);
  }

  const apiMap = new Map(apiDetails.map((a) => [a.id, a]));
  const topIds = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  return topIds
    .filter((id) => apiMap.has(id))
    .map((id) => {
      const api = apiMap.get(id)!;
      return {
        id: `popular-${id}`,
        title: `${api.name} 활용 서비스`,
        description: api.description ?? '',
        context: contexts.get(id) ?? '',
        apiNames: [api.name],
        apiIds: [id],
        category: api.category ?? '',
        usageCount: counts.get(id) ?? 0,
      };
    });
}

/**
 * CURATED_SERVICES의 이름을 nameToIdMap으로 실제 id로 해석한다.
 */
export function resolveCuratedServices(nameToIdMap: Map<string, string>): PopularService[] {
  return CURATED_SERVICES.map((curated) => {
    const resolvedIds = curated.apiNames
      .map((name) => nameToIdMap.get(name.toLowerCase()))
      .filter((id): id is string => id != null);

    return {
      ...curated,
      apiIds: resolvedIds,
      usageCount: 0,
    };
  });
}
