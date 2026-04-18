'use client';

export interface Template {
  id: string;
  label: string;
  text: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'dashboard',
    label: '대시보드',
    text: '데이터를 시각화하는 대시보드를 만들어주세요. 주요 지표를 카드로 표시하고, 차트와 그래프로 데이터 트렌드를 보여줍니다. 실시간 업데이트가 가능한 깔끔한 UI로 구성합니다.',
  },
  {
    id: 'calculator',
    label: '계산기/변환기',
    text: '사용자가 값을 입력하면 실시간으로 계산하거나 변환해주는 도구를 만들어주세요. 입력 필드와 결과 표시 영역을 명확히 분리하고, 변환 히스토리를 제공합니다.',
  },
  {
    id: 'info-lookup',
    label: '정보 조회',
    text: '검색어를 입력하면 관련 정보를 조회하여 보여주는 서비스를 만들어주세요. 검색 결과를 카드 형태로 표시하고, 필터와 정렬 기능을 제공합니다.',
  },
  {
    id: 'gallery',
    label: '갤러리',
    text: '이미지나 콘텐츠를 그리드 형태로 보여주는 갤러리 서비스를 만들어주세요. 카테고리 필터, 무한 스크롤, 상세 보기 모달을 제공합니다.',
  },
  {
    id: 'map-service',
    label: '지도 서비스',
    text: '위치 기반 정보를 지도 위에 표시하는 서비스를 만들어주세요. Leaflet 지도를 사용하고, 마커 클릭 시 상세 정보를 팝업으로 보여줍니다.',
  },
  {
    id: 'content-feed',
    label: '콘텐츠 피드',
    text: '뉴스나 게시글을 스크롤 기반 피드로 보여주는 서비스를 만들어주세요. 카테고리별 탭, 검색, 각 항목은 카드 형태로 표시합니다.',
  },
  {
    id: 'comparison',
    label: '실시간 비교',
    text: '두 항목을 나란히 비교할 수 있는 서비스를 만들어주세요. 각 항목의 주요 지표를 비교 카드로 표시하고, 차이를 배지로 강조해 주세요.',
  },
  {
    id: 'timeline',
    label: '타임라인/이벤트',
    text: '시간 순서대로 이벤트를 보여주는 타임라인 서비스를 만들어주세요. 세로 타임라인에 날짜 마커와 이벤트 카드를 표시하고, 연도별 필터를 제공합니다.',
  },
  {
    id: 'news-curator',
    label: '뉴스 큐레이터',
    text: '최신 뉴스를 큐레이션해서 보여주는 서비스를 만들어주세요. 카드 그리드로 헤드라인을 표시하고, 소스 필터와 태그 클라우드를 제공합니다.',
  },
  {
    id: 'quiz',
    label: '퀴즈/인터랙티브',
    text: '인터랙티브 퀴즈 서비스를 만들어주세요. 질문 카드와 선택지를 표시하고, 진행 상황을 프로그레스바로 보여주며, 마지막에 결과 요약을 제공합니다.',
  },
  {
    id: 'profile',
    label: '프로필/포트폴리오',
    text: '사용자 프로필 또는 포트폴리오 페이지를 만들어주세요. 헤더 배너, 주요 스탯 카드, 활동 피드와 프로젝트 탭을 제공합니다.',
  },
];

interface TemplateSelectorProps {
  onSelect: (template: Template) => void;
  aiSuggestedId?: string | null;
  isLoadingAi?: boolean;
}

export default function TemplateSelector({
  onSelect,
  aiSuggestedId,
  isLoadingAi,
}: TemplateSelectorProps) {
  return (
    <div>
      {isLoadingAi && (
        <p className="mb-1 text-xs" style={{ color: 'var(--accent-primary)' }}>
          ✦ AI 추천 준비 중...
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((tmpl) => (
          <button
            key={tmpl.id}
            type="button"
            onClick={() => onSelect(tmpl)}
            className="btn-secondary relative px-3 py-1.5 text-sm"
          >
            {tmpl.label}
            {tmpl.id === aiSuggestedId && (
              <span
                className="absolute -right-1 -top-1 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium"
                style={{ background: '#7c3aed', color: 'white', fontSize: '10px' }}
              >
                ★ AI
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
