import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class InfoLookupTemplate implements ICodeTemplate {
  readonly id = 'info-lookup';
  readonly name = '정보 조회';
  readonly description = '검색 기반 상세 정보 조회 서비스';
  readonly category = 'lookup';
  readonly supportedApiCategories = ['날씨', '인물', '장소', '사전', 'weather', 'person', 'place', 'dictionary', 'lookup'];

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
      html: `<div class="lookup-app">
    <header>
      <h1>정보 조회</h1>
      <p>${context.userContext.slice(0, 80)}</p>
    </header>
    <div class="search-section">
      <div class="search-bar">
        <input type="text" id="search-input" placeholder="검색어를 입력하세요..." />
        <button id="search-btn" onclick="search()">검색</button>
      </div>
    </div>
    <div id="result-section" style="display:none;">
      <div class="detail-card" id="detail-card">
        <div class="detail-header" id="detail-header"></div>
        <div class="detail-body" id="detail-body"></div>
      </div>
      <div class="related-section">
        <h3>관련 항목</h3>
        <ul class="related-list" id="related-list"></ul>
      </div>
    </div>
    <div class="empty-state" id="empty-state">
      <p>검색어를 입력하고 조회하세요.</p>
    </div>
    <div class="loading" id="loading" style="display:none;">
      <div class="spinner"></div>
    </div>
  </div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f8fafc; min-height: 100vh; }
.lookup-app { max-width: 800px; margin: 0 auto; padding: 2rem; }
header h1 { font-size: 1.75rem; font-weight: 700; color: #1e293b; }
header p { color: #64748b; margin-top: 0.25rem; margin-bottom: 1.5rem; font-size: 0.875rem; }
.search-bar { display: flex; gap: 0.5rem; }
#search-input { flex: 1; padding: 0.75rem 1rem; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 1rem; outline: none; transition: border-color 0.2s; }
#search-input:focus { border-color: #3b82f6; }
#search-btn { padding: 0.75rem 1.5rem; background: #3b82f6; color: white; border: none; border-radius: 10px; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
#search-btn:hover { background: #2563eb; }
.detail-card { background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 1px 8px rgba(0,0,0,0.08); margin-top: 1.5rem; }
.detail-header { font-size: 1.25rem; font-weight: 700; color: #1e293b; margin-bottom: 1rem; }
.detail-body { color: #334155; line-height: 1.6; }
.related-section { margin-top: 1.5rem; }
.related-section h3 { font-size: 0.875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem; }
.related-list { list-style: none; display: flex; flex-wrap: wrap; gap: 0.5rem; }
.related-list li { padding: 0.375rem 0.75rem; background: #f1f5f9; border-radius: 20px; font-size: 0.8rem; color: #475569; cursor: pointer; transition: background 0.2s; }
.related-list li:hover { background: #e2e8f0; }
.empty-state { text-align: center; padding: 4rem 2rem; color: #94a3b8; }
.loading { text-align: center; padding: 2rem; }
.spinner { width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto; }
@keyframes spin { to { transform: rotate(360deg); } }`,
      js: `async function search() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;

  const btn = document.getElementById('search-btn');
  btn.disabled = true;
  btn.textContent = '검색 중...';
  document.getElementById('result-section').style.display = 'none';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('loading').style.display = 'block';

  try {
    const _apiUrl = '${context.apis[0]?.authType !== 'none'
      ? '/api/v1/proxy?apiId=' + (context.apis[0]?.id ?? '') + '&proxyPath=' + encodeURIComponent(context.apis[0]?.endpoints[0]?.path ?? '/search')
      : (context.apis[0]?.baseUrl ?? 'https://api.example.com') + (context.apis[0]?.endpoints[0]?.path ?? '/search')}';
    const res = await fetch(_apiUrl + '&q=' + encodeURIComponent(query));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const _raw = data${context.apis[0]?.endpoints[0]?.responseDataPath ? '.' + context.apis[0].endpoints[0].responseDataPath : ''} ?? data.results ?? data.data ?? data;
    const item = Array.isArray(_raw) ? _raw[0] : _raw;
    renderResult(item, query);
  } catch (err) {
    document.getElementById('detail-card').innerHTML = '<p style="color:#ef4444;padding:1rem">데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>';
    document.getElementById('result-section').style.display = 'block';
    console.error(err);
  } finally {
    document.getElementById('loading').style.display = 'none';
    btn.disabled = false;
    btn.textContent = '검색';
  }
}

function renderResult(data, query) {
  if (!data) {
    document.getElementById('empty-state').style.display = 'block';
    document.getElementById('empty-state').innerHTML = '<p style="color:#64748b;padding:2rem;text-align:center">검색 결과가 없습니다: ' + query + '</p>';
    return;
  }
  const title = data.title ?? data.name ?? data.word ?? query;
  const body = data.description ?? data.body ?? data.definition ?? data.summary ?? JSON.stringify(data, null, 2).slice(0, 300);
  const related = data.related ?? data.tags ?? data.synonyms ?? [];
  document.getElementById('detail-header').textContent = title;
  document.getElementById('detail-body').textContent = body;
  document.getElementById('related-list').innerHTML = related.map(r =>
    '<li onclick="document.getElementById(\'search-input\').value=\'' + r + '\';search()">' + r + '</li>'
  ).join('');
  document.getElementById('result-section').style.display = 'block';
}

function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'block' : 'none';
}

document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') search();
});`,
      promptHint: `Layout: search-detail
Required sections: 검색바+버튼, 결과 상세카드(제목+본문), 관련 항목 리스트
Must include: DOMContentLoaded에서 검색 API fetch() 구현, Enter 키 검색, 로딩 상태, 에러 Empty State
API call pattern: fetch() → data.responseDataPath → renderResult()
Avoid: 하드코딩 데이터, 가데이터 배열, picsum.photos`,
    };
  }
}
