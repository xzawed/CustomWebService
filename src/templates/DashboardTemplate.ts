import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class DashboardTemplate implements ICodeTemplate {
  readonly id = 'dashboard';
  readonly name = '대시보드';
  readonly description = '데이터 시각화 대시보드';
  readonly category = 'dashboard';
  readonly supportedApiCategories = [
    '금융',
    '날씨',
    '통계',
    '뉴스',
    'finance',
    'weather',
    'statistics',
  ];

  matchScore(apis: ApiCatalogItem[]): number {
    const matchingApis = apis.filter((api) =>
      this.supportedApiCategories.some((cat) =>
        api.category.toLowerCase().includes(cat.toLowerCase())
      )
    );
    return apis.length > 0 ? matchingApis.length / apis.length : 0;
  }

  generate(context: TemplateContext): TemplateOutput {
    const apiCards = context.apis
      .map(
        (api, i) =>
          `<div class="card" id="card-${i}">
        <h3>${api.name}</h3>
        <div class="card-value" id="value-${i}">로딩 중...</div>
        <p class="card-desc">${api.description}</p>
      </div>`
      )
      .join('\n      ');

    const fetchCalls = context.apis
      .map(
        (api, i) =>
          `  async function fetchData${i}() {
    try {
      const res = await fetch('${api.baseUrl}${api.endpoints[0]?.path ?? ''}');
      const data = await res.json();
      document.getElementById('value-${i}').textContent = JSON.stringify(data).slice(0, 100);
    } catch (err) {
      document.getElementById('value-${i}').textContent = '데이터 로드 실패';
    }
  }`
      )
      .join('\n\n');

    const initCalls = context.apis.map((_, i) => `  fetchData${i}();`).join('\n');

    return {
      html: `<div class="dashboard">
    <header class="dashboard-header">
      <h1>데이터 대시보드</h1>
      <p>${context.userContext.slice(0, 100)}</p>
    </header>
    <div class="cards-grid">
      ${apiCards}
    </div>
    <div class="refresh-bar">
      <button onclick="refreshAll()">새로고침</button>
      <span id="last-updated"></span>
    </div>
  </div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f0f2f5; color: #1a1a2e; }
.dashboard { max-width: 1200px; margin: 0 auto; padding: 2rem; }
.dashboard-header { margin-bottom: 2rem; }
.dashboard-header h1 { font-size: 1.75rem; font-weight: 700; }
.dashboard-header p { color: #666; margin-top: 0.5rem; }
.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
.card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: transform 0.2s; }
.card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.card h3 { font-size: 0.875rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
.card-value { font-size: 1.5rem; font-weight: 700; margin: 0.75rem 0; color: #2563eb; word-break: break-all; }
.card-desc { font-size: 0.8rem; color: #999; }
.refresh-bar { margin-top: 2rem; display: flex; align-items: center; gap: 1rem; }
.refresh-bar button { padding: 0.5rem 1.25rem; border: none; background: #2563eb; color: white; border-radius: 8px; cursor: pointer; font-size: 0.875rem; }
.refresh-bar button:hover { background: #1d4ed8; }
#last-updated { font-size: 0.8rem; color: #999; }`,
      js: `${fetchCalls}

function refreshAll() {
${initCalls}
  document.getElementById('last-updated').textContent = '마지막 업데이트: ' + new Date().toLocaleTimeString('ko-KR');
}

refreshAll();
setInterval(refreshAll, 60000);`,
      promptHint:
        '이 대시보드 템플릿을 기반으로, 사용자의 요구사항에 맞게 카드 레이아웃, 차트, 실시간 업데이트를 커스터마이징해주세요. Chart.js CDN을 활용할 수 있습니다.',
    };
  }
}
