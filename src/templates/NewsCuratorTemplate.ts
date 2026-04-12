import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class NewsCuratorTemplate implements ICodeTemplate {
  readonly id = 'news-curator';
  readonly name = '뉴스 큐레이터';
  readonly description = '헤드라인 그리드 + 소스 필터 + 태그 클라우드';
  readonly category = 'news';
  readonly supportedApiCategories = ['뉴스', '미디어', '기사', 'news', 'media', 'article', 'headline'];

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
      html: `<div class="news-app">
    <header>
      <h1>뉴스 큐레이터</h1>
      <p>${context.userContext.slice(0, 80)}</p>
    </header>
    <div class="source-filters" id="source-filters">
      <button class="src-btn active" data-src="all">전체</button>
      <button class="src-btn" data-src="tech">기술</button>
      <button class="src-btn" data-src="business">비즈니스</button>
      <button class="src-btn" data-src="world">세계</button>
    </div>
    <div class="tag-cloud" id="tag-cloud"></div>
    <div class="news-grid" id="news-grid"></div>
    <div class="loading" id="news-loading" style="display:none;">
      <div class="spinner"></div>
    </div>
  </div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f8fafc; }
.news-app { max-width: 1100px; margin: 0 auto; padding: 2rem 1rem; }
header h1 { font-size: 1.75rem; font-weight: 700; color: #1e293b; }
header p { color: #64748b; margin-top: 0.25rem; margin-bottom: 1.25rem; font-size: 0.875rem; }
.source-filters { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
.src-btn { padding: 0.4rem 1rem; border: 1px solid #e2e8f0; background: white; border-radius: 20px; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; }
.src-btn.active { background: #1e293b; color: white; border-color: #1e293b; }
.tag-cloud { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.5rem; }
.tag { padding: 0.25rem 0.625rem; background: #f1f5f9; border-radius: 12px; font-size: 0.7rem; color: #475569; cursor: pointer; transition: background 0.15s; }
.tag:hover, .tag.active { background: #dbeafe; color: #1d4ed8; }
.news-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.25rem; }
.news-card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); cursor: pointer; transition: box-shadow 0.2s; }
.news-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
.news-card-img { width: 100%; height: 160px; object-fit: cover; background: #e2e8f0; }
.news-card-body { padding: 1rem; }
.news-card-source { font-size: 0.7rem; font-weight: 600; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.05em; }
.news-card-title { font-size: 0.875rem; font-weight: 600; color: #1e293b; margin-top: 0.35rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.news-card-time { font-size: 0.7rem; color: #94a3b8; margin-top: 0.5rem; }
.loading { text-align: center; padding: 2rem; }
.spinner { width: 28px; height: 28px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto; }
@keyframes spin { to { transform: rotate(360deg); } }`,
      js: `let allNews = [];
let activeSource = 'all';
let activeTag = null;

async function loadNews() {
  document.getElementById('news-loading').style.display = 'block';
  try {
    // 실제 API 호출로 교체
    allNews = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      title: '뉴스 헤드라인 ' + (i + 1) + ': 최신 소식입니다.',
      source: ['tech', 'business', 'world'][i % 3],
      time: new Date(Date.now() - i * 3600000).toLocaleString('ko-KR'),
      img: 'https://picsum.photos/300/160?random=' + i,
      tags: [['AI', '기술', '트렌드'], ['경제', '시장', '글로벌'], ['국제', '정치', '사회']][i % 3],
    }));
    buildTagCloud();
    renderNews();
  } catch (err) {
    document.getElementById('news-grid').innerHTML = '<p style="color:#ef4444;grid-column:1/-1;text-align:center">데이터를 불러오지 못했습니다.</p>';
  } finally {
    document.getElementById('news-loading').style.display = 'none';
  }
}

function buildTagCloud() {
  const tagSet = new Set();
  allNews.forEach(n => n.tags.forEach(t => tagSet.add(t)));
  document.getElementById('tag-cloud').innerHTML = [...tagSet].map(t =>
    '<span class="tag" onclick="filterByTag(\'' + t + '\')">' + t + '</span>'
  ).join('');
}

function renderNews() {
  const filtered = allNews.filter(n =>
    (activeSource === 'all' || n.source === activeSource) &&
    (!activeTag || n.tags.includes(activeTag))
  );
  document.getElementById('news-grid').innerHTML = filtered.length === 0
    ? '<p style="color:#94a3b8;grid-column:1/-1;text-align:center;padding:2rem">결과가 없습니다.</p>'
    : filtered.map(n =>
        '<div class="news-card">' +
          '<img class="news-card-img" src="' + n.img + '" alt="" loading="lazy"/>' +
          '<div class="news-card-body">' +
            '<div class="news-card-source">' + n.source + '</div>' +
            '<div class="news-card-title">' + n.title + '</div>' +
            '<div class="news-card-time">' + n.time + '</div>' +
          '</div>' +
        '</div>'
      ).join('');
}

function filterByTag(tag) {
  activeTag = activeTag === tag ? null : tag;
  document.querySelectorAll('.tag').forEach(el => {
    const tagEl = el instanceof HTMLElement ? el : null;
    if (tagEl) tagEl.classList.toggle('active', tagEl.textContent === activeTag);
  });
  renderNews();
}

document.getElementById('source-filters').addEventListener('click', (e) => {
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (!target?.classList.contains('src-btn')) return;
  document.querySelectorAll('.src-btn').forEach(b => b.classList.remove('active'));
  target.classList.add('active');
  activeSource = target.dataset['src'] ?? 'all';
  renderNews();
});

loadNews();`,
      promptHint: `Layout: news-grid-curator
Required sections (in order): 제목/설명 헤더, 소스 필터 버튼, 태그 클라우드, 뉴스 카드 그리드
UI patterns: auto-fill 그리드(minmax 300px), 카드(이미지 상단+텍스트 하단), 태그 토글
Must include: 소스별 필터, 태그 클라우드 토글, 카드당 소스+제목+시간
Avoid: 단일 컬럼, 무한 스크롤, 지도`,
    };
  }
}
