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
    id: 'map',
    label: '지도 서비스',
    text: '위치 기반 정보를 지도 위에 표시하는 서비스를 만들어주세요. Leaflet 지도를 사용하고, 마커 클릭 시 상세 정보를 팝업으로 보여줍니다.',
  },
  {
    id: 'feed',
    label: '콘텐츠 피드',
    text: '뉴스나 게시글을 스크롤 기반 피드로 보여주는 서비스를 만들어주세요. 카테고리별 탭, 검색, 각 항목은 카드 형태로 표시합니다.',
  },
];

interface TemplateSelectorProps {
  onSelect: (template: Template) => void;
}

export default function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TEMPLATES.map((tmpl) => (
        <button
          key={tmpl.id}
          type="button"
          onClick={() => onSelect(tmpl)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
        >
          {tmpl.label}
        </button>
      ))}
    </div>
  );
}
