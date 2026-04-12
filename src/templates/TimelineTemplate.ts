import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class TimelineTemplate implements ICodeTemplate {
  readonly id = 'timeline';
  readonly name = '타임라인/이벤트';
  readonly description = '세로 타임라인 이벤트 뷰어';
  readonly category = 'timeline';
  readonly supportedApiCategories = ['이벤트', '일정', '역사', 'event', 'schedule', 'history', 'timeline'];

  matchScore(apis: ApiCatalogItem[]): number {
    const matchingApis = apis.filter((api) =>
      this.supportedApiCategories.some((cat) =>
        api.category.toLowerCase().includes(cat.toLowerCase()) ||
        api.name.toLowerCase().includes(cat.toLowerCase())
      )
    );
    return apis.length > 0 ? matchingApis.length / apis.length : 0;
  }

  generate(context: TemplateContext): TemplateOutput {
    return {
      html: `<div class="timeline-app">
    <header>
      <h1>타임라인</h1>
      <p>${context.userContext.slice(0, 80)}</p>
    </header>
    <div class="timeline-controls">
      <input type="text" id="timeline-search" placeholder="이벤트 검색..." />
      <select id="year-filter">
        <option value="all">전체 연도</option>
      </select>
    </div>
    <div class="timeline" id="timeline">
      <div class="loading-msg">로딩 중...</div>
    </div>
  </div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f8fafc; min-height: 100vh; }
.timeline-app { max-width: 720px; margin: 0 auto; padding: 2rem; }
header h1 { font-size: 1.75rem; font-weight: 700; color: #1e293b; }
header p { color: #64748b; margin-top: 0.25rem; font-size: 0.875rem; }
.timeline-controls { display: flex; gap: 0.75rem; margin: 1.5rem 0; flex-wrap: wrap; }
#timeline-search { flex: 1; min-width: 180px; padding: 0.625rem 1rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.875rem; outline: none; }
#timeline-search:focus { border-color: #3b82f6; }
#year-filter { padding: 0.625rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.875rem; outline: none; background: white; }
.timeline { position: relative; padding-left: 2rem; }
.timeline::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: #e2e8f0; }
.event-item { position: relative; padding: 0 0 2rem 1.5rem; }
.event-item::before { content: ''; position: absolute; left: -0.45rem; top: 0.25rem; width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; border: 2px solid white; box-shadow: 0 0 0 2px #3b82f6; }
.event-date { font-size: 0.75rem; font-weight: 600; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; }
.event-card { background: white; border-radius: 12px; padding: 1rem 1.25rem; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.event-icon { font-size: 1.25rem; margin-bottom: 0.5rem; }
.event-title { font-size: 0.925rem; font-weight: 600; color: #1e293b; margin-bottom: 0.35rem; }
.event-desc { font-size: 0.8rem; color: #64748b; line-height: 1.5; }
.loading-msg { color: #94a3b8; text-align: center; padding: 2rem; }`,
      js: `let events = [];

async function loadEvents() {
  try {
    // 실제 API 호출로 교체
    events = [
      { id: 1, date: '2024-01', title: '이벤트 1', desc: '설명 1', icon: '🚀', year: 2024 },
      { id: 2, date: '2024-06', title: '이벤트 2', desc: '설명 2', icon: '✨', year: 2024 },
      { id: 3, date: '2023-03', title: '이벤트 3', desc: '설명 3', icon: '📌', year: 2023 },
    ];
    populateYearFilter();
    renderTimeline(events);
  } catch (err) {
    document.getElementById('timeline').innerHTML = '<p style="color:#ef4444;text-align:center">데이터를 불러오지 못했습니다.</p>';
  }
}

function populateYearFilter() {
  const years = [...new Set(events.map(e => e.year))].sort((a, b) => b - a);
  const sel = document.getElementById('year-filter');
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y) + '년';
    sel.appendChild(opt);
  });
}

function renderTimeline(items) {
  const container = document.getElementById('timeline');
  if (items.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:2rem">결과가 없습니다.</p>';
    return;
  }
  container.innerHTML = items.map(ev =>
    '<div class="event-item">' +
      '<div class="event-date">' + ev.date + '</div>' +
      '<div class="event-card">' +
        '<div class="event-icon">' + ev.icon + '</div>' +
        '<div class="event-title">' + ev.title + '</div>' +
        '<div class="event-desc">' + ev.desc + '</div>' +
      '</div>' +
    '</div>'
  ).join('');
}

function applyFilters() {
  const q = document.getElementById('timeline-search').value.toLowerCase();
  const year = document.getElementById('year-filter').value;
  const filtered = events.filter(ev =>
    (year === 'all' || String(ev.year) === year) &&
    (ev.title.toLowerCase().includes(q) || ev.desc.toLowerCase().includes(q))
  );
  renderTimeline(filtered);
}

let searchTimer;
document.getElementById('timeline-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 300);
});
document.getElementById('year-filter').addEventListener('change', applyFilters);

loadEvents();`,
      promptHint: `Layout: vertical-timeline
Required sections (in order): 제목/설명 헤더, 검색바 + 연도 필터, 세로 타임라인(날짜 마커 + 이벤트 카드)
UI patterns: 좌측 수직선 + 원형 마커, 카드형 이벤트 항목, 날짜 상단 표시
Must include: 연도별 필터 셀렉트, 검색 디바운스(300ms), 이벤트 아이콘
Avoid: 수평 타임라인, 차트, 지도`,
    };
  }
}
