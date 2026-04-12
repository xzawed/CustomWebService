import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class ContentFeedTemplate implements ICodeTemplate {
  readonly id = 'content-feed';
  readonly name = '콘텐츠 피드';
  readonly description = '카드 리스트 + 카테고리 필터 + 무한 스크롤';
  readonly category = 'feed';
  readonly supportedApiCategories = ['뉴스', '블로그', '콘텐츠', 'news', 'blog', 'content', 'feed', 'article'];

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
      html: `<div class="feed-app">
    <header>
      <h1>콘텐츠 피드</h1>
      <p>${context.userContext.slice(0, 80)}</p>
    </header>
    <div class="filter-tabs" id="filter-tabs">
      <button class="tab active" data-cat="all">전체</button>
      <button class="tab" data-cat="tech">기술</button>
      <button class="tab" data-cat="world">세계</button>
      <button class="tab" data-cat="business">비즈니스</button>
    </div>
    <div class="card-list" id="card-list"></div>
    <div class="loading-sentinel" id="loading-sentinel">
      <div class="spinner" id="feed-spinner" style="display:none;"></div>
      <p id="end-message" style="display:none;color:#94a3b8;text-align:center;padding:1rem;">모든 콘텐츠를 불러왔습니다.</p>
    </div>
  </div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f8fafc; }
.feed-app { max-width: 720px; margin: 0 auto; padding: 2rem 1rem; }
header h1 { font-size: 1.75rem; font-weight: 700; color: #1e293b; }
header p { color: #64748b; margin-top: 0.25rem; margin-bottom: 1.25rem; font-size: 0.875rem; }
.filter-tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
.tab { padding: 0.5rem 1rem; border: 1px solid #e2e8f0; background: white; border-radius: 20px; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; }
.tab.active { background: #1e293b; color: white; border-color: #1e293b; }
.card-list { display: flex; flex-direction: column; gap: 1rem; }
.feed-card { background: white; border-radius: 12px; padding: 1.25rem; box-shadow: 0 1px 4px rgba(0,0,0,0.06); display: flex; gap: 1rem; cursor: pointer; transition: box-shadow 0.2s; }
.feed-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.feed-card-thumb { width: 80px; height: 80px; background: #e2e8f0; border-radius: 8px; flex-shrink: 0; object-fit: cover; }
.feed-card-content { flex: 1; min-width: 0; }
.feed-card-category { font-size: 0.7rem; font-weight: 600; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
.feed-card-title { font-size: 0.9rem; font-weight: 600; color: #1e293b; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.feed-card-meta { font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem; }
.loading-sentinel { padding: 1rem 0; text-align: center; }
.spinner { width: 28px; height: 28px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto; }
@keyframes spin { to { transform: rotate(360deg); } }`,
      js: `let page = 1;
let currentCat = 'all';
let loading = false;
let hasMore = true;

async function loadMore() {
  if (loading || !hasMore) return;
  loading = true;
  document.getElementById('feed-spinner').style.display = 'block';

  try {
    // 실제 API 호출로 교체 (page, currentCat 파라미터 활용)
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: (page - 1) * 10 + i,
      title: '콘텐츠 제목 ' + ((page - 1) * 10 + i + 1),
      category: ['tech', 'world', 'business'][(i) % 3],
      source: '출처',
      time: new Date(Date.now() - i * 3600000).toLocaleString('ko-KR'),
      thumb: 'https://picsum.photos/80/80?random=' + ((page - 1) * 10 + i),
    }));

    const filtered = currentCat === 'all' ? items : items.filter(it => it.category === currentCat);
    appendCards(filtered);
    page++;
    if (page > 5) { hasMore = false; document.getElementById('end-message').style.display = 'block'; }
  } catch (err) {
    console.error(err);
  } finally {
    loading = false;
    document.getElementById('feed-spinner').style.display = 'none';
  }
}

function appendCards(items) {
  const list = document.getElementById('card-list');
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'feed-card';
    card.innerHTML =
      '<img class="feed-card-thumb" src="' + item.thumb + '" alt="" />' +
      '<div class="feed-card-content">' +
        '<div class="feed-card-category">' + item.category + '</div>' +
        '<div class="feed-card-title">' + item.title + '</div>' +
        '<div class="feed-card-meta">' + item.source + ' · ' + item.time + '</div>' +
      '</div>';
    list.appendChild(card);
  });
}

// Infinite scroll via IntersectionObserver
const sentinel = document.getElementById('loading-sentinel');
const observer = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) loadMore();
}, { rootMargin: '200px' });
observer.observe(sentinel);

// Category filter
document.getElementById('filter-tabs').addEventListener('click', (e) => {
  if (!e.target.classList.contains('tab')) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  currentCat = e.target.dataset.cat;
  page = 1;
  hasMore = true;
  document.getElementById('card-list').innerHTML = '';
  document.getElementById('end-message').style.display = 'none';
  loadMore();
});

loadMore();`,
      promptHint: `Layout: vertical-feed
Required sections (in order): 제목/설명 헤더, 카테고리 필터 탭, 카드 리스트, 무한 스크롤 센티넬
UI patterns: 세로 단일 컬럼(최대 720px), 가로형 카드(썸네일 좌측 + 텍스트 우측), 상단 고정 탭
Must include: IntersectionObserver 무한 스크롤, 카테고리 필터, 카드당 카테고리 배지 + 출처 + 시간
Avoid: 마소닉 그리드, 지도, 차트`,
    };
  }
}
