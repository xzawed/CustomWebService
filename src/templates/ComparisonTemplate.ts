import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class ComparisonTemplate implements ICodeTemplate {
  readonly id = 'comparison';
  readonly name = '실시간 비교';
  readonly description = '두 항목을 나란히 비교하는 인터페이스';
  readonly category = 'comparison';
  readonly supportedApiCategories = ['비교', '환율', '주식', '가격', 'compare', 'exchange', 'stock', 'price'];

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
      html: `<div class="comparison-app">
    <header>
      <h1>비교</h1>
      <p>${context.userContext.slice(0, 80)}</p>
    </header>
    <div class="comparison-controls">
      <input type="text" id="item-a-input" placeholder="항목 A" />
      <span class="vs-badge">VS</span>
      <input type="text" id="item-b-input" placeholder="항목 B" />
      <button id="compare-btn" onclick="compare()">비교</button>
    </div>
    <div class="comparison-grid" id="comparison-grid" style="display:none;">
      <div class="compare-card" id="card-a">
        <h2 class="item-name" id="name-a"></h2>
        <div class="stats" id="stats-a"></div>
      </div>
      <div class="diff-column" id="diff-column">
        <div class="diff-badge-list" id="diff-list"></div>
      </div>
      <div class="compare-card" id="card-b">
        <h2 class="item-name" id="name-b"></h2>
        <div class="stats" id="stats-b"></div>
      </div>
    </div>
    <div class="empty-state" id="empty-state">두 항목을 입력하고 비교하세요.</div>
  </div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f8fafc; min-height: 100vh; }
.comparison-app { max-width: 900px; margin: 0 auto; padding: 2rem; }
header h1 { font-size: 1.75rem; font-weight: 700; color: #1e293b; }
header p { color: #64748b; margin-top: 0.25rem; margin-bottom: 1.5rem; font-size: 0.875rem; }
.comparison-controls { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.comparison-controls input { flex: 1; min-width: 120px; padding: 0.625rem 1rem; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 0.9rem; outline: none; transition: border-color 0.2s; }
.comparison-controls input:focus { border-color: #3b82f6; }
.vs-badge { background: #f1f5f9; color: #64748b; padding: 0.375rem 0.75rem; border-radius: 20px; font-weight: 700; font-size: 0.875rem; }
#compare-btn { padding: 0.625rem 1.5rem; background: #3b82f6; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
#compare-btn:hover { background: #2563eb; }
.comparison-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; margin-top: 1.5rem; align-items: start; }
.compare-card { background: white; border-radius: 16px; padding: 1.5rem; box-shadow: 0 1px 8px rgba(0,0,0,0.08); }
.item-name { font-size: 1.1rem; font-weight: 700; color: #1e293b; margin-bottom: 1rem; }
.stats { display: flex; flex-direction: column; gap: 0.75rem; }
.stat-row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #f1f5f9; font-size: 0.875rem; }
.stat-label { color: #64748b; }
.stat-value { font-weight: 600; color: #1e293b; }
.diff-column { display: flex; flex-direction: column; gap: 0.75rem; padding-top: 3.5rem; }
.diff-badge { background: #fef3c7; color: #92400e; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.7rem; font-weight: 600; text-align: center; }
.diff-badge.positive { background: #dcfce7; color: #166534; }
.diff-badge.negative { background: #fee2e2; color: #991b1b; }
.empty-state { text-align: center; padding: 4rem; color: #94a3b8; margin-top: 1.5rem; }`,
      js: `async function compare() {
  const a = document.getElementById('item-a-input').value.trim();
  const b = document.getElementById('item-b-input').value.trim();
  if (!a || !b) return;

  document.getElementById('empty-state').style.display = 'none';

  try {
    // 실제 API 호출로 교체
    const dataA = { name: a, stats: [{ label: '항목1', value: '100' }, { label: '항목2', value: '200' }] };
    const dataB = { name: b, stats: [{ label: '항목1', value: '150' }, { label: '항목2', value: '180' }] };
    renderComparison(dataA, dataB);
  } catch (err) {
    alert('데이터를 불러오지 못했습니다.');
  }
}

function renderComparison(a, b) {
  document.getElementById('name-a').textContent = a.name;
  document.getElementById('name-b').textContent = b.name;

  const renderStats = (containerId, stats) => {
    document.getElementById(containerId).innerHTML = stats.map(s =>
      '<div class="stat-row"><span class="stat-label">' + s.label + '</span><span class="stat-value">' + s.value + '</span></div>'
    ).join('');
  };
  renderStats('stats-a', a.stats);
  renderStats('stats-b', b.stats);

  const diffs = a.stats.map((s, i) => {
    const va = parseFloat(s.value), vb = parseFloat(b.stats[i]?.value ?? '0');
    if (isNaN(va) || isNaN(vb)) return { label: '–', cls: '' };
    const pct = ((vb - va) / va * 100).toFixed(1);
    return { label: (vb > va ? '+' : '') + pct + '%', cls: vb > va ? 'positive' : vb < va ? 'negative' : '' };
  });
  document.getElementById('diff-list').innerHTML = diffs.map(d =>
    '<div class="diff-badge ' + d.cls + '">' + d.label + '</div>'
  ).join('');

  document.getElementById('comparison-grid').style.display = 'grid';
}

document.querySelectorAll('.comparison-controls input').forEach(el => {
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') compare(); });
});`,
      promptHint: `Layout: two-column-comparison
Required sections (in order): 제목/설명 헤더, 입력 컨트롤(A vs B 입력 + 비교 버튼), 2열 비교 카드 + 중앙 차이 배지
UI patterns: 3열 그리드(카드A + 배지컬럼 + 카드B), 수치 차이 색상 강조(양수=초록, 음수=빨강)
Must include: 두 항목 동시 입력, 차이 배지(퍼센트), 항목별 stat-row
Avoid: 단일 컬럼, 지도, 무한 스크롤`,
    };
  }
}
