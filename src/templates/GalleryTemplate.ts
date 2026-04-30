import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class GalleryTemplate implements ICodeTemplate {
  readonly id = 'gallery';
  readonly name = '갤러리';
  readonly description = '마소닉 그리드 + 검색바 + 라이트박스 모달';
  readonly category = 'gallery';
  readonly supportedApiCategories = [
    '갤러리',
    '이미지',
    '사진',
    '아트',
    'gallery',
    'image',
    'photo',
    'art',
    'media',
    'unsplash',
    'pixabay',
  ];

  matchScore(apis: ApiCatalogItem[]): number {
    const matchingApis = apis.filter((api) =>
      this.supportedApiCategories.some(
        (cat) =>
          api.category.toLowerCase().includes(cat.toLowerCase()) ||
          api.name.toLowerCase().includes(cat.toLowerCase()),
      ),
    );
    return apis.length > 0 ? matchingApis.length / apis.length : 0;
  }

  generate(context: TemplateContext): TemplateOutput {
    return {
      html: `<div class="gallery-app">
    <header>
      <h1>갤러리</h1>
      <p>${context.userContext.slice(0, 80)}</p>
    </header>
    <div class="search-bar">
      <input type="text" id="search-input" placeholder="검색어를 입력하세요" />
      <button id="search-btn">검색</button>
    </div>
    <div class="masonry" id="masonry"></div>
    <div class="loading" id="gallery-loading" style="display:none;">
      <div class="spinner"></div>
    </div>
    <div class="empty" id="gallery-empty" style="display:none;">결과가 없습니다.</div>
    <div class="lightbox" id="lightbox" style="display:none;">
      <button class="lightbox-close" id="lightbox-close" aria-label="닫기">&times;</button>
      <img class="lightbox-img" id="lightbox-img" src="" alt="" />
      <div class="lightbox-caption" id="lightbox-caption"></div>
    </div>
  </div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f8fafc; color: #1e293b; }
.gallery-app { max-width: 1200px; margin: 0 auto; padding: 2rem 1rem; }
header h1 { font-size: 1.75rem; font-weight: 700; }
header p { color: #64748b; margin-top: 0.25rem; margin-bottom: 1.25rem; font-size: 0.875rem; }
.search-bar { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
.search-bar input { flex: 1; padding: 0.6rem 0.875rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.9rem; background: white; }
.search-bar input:focus { outline: 2px solid #3b82f6; outline-offset: -1px; border-color: #3b82f6; }
.search-bar button { padding: 0.6rem 1.25rem; background: #1e293b; color: white; border: none; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: background 0.15s; }
.search-bar button:hover { background: #0f172a; }
.masonry { column-count: 3; column-gap: 1rem; }
@media (max-width: 900px) { .masonry { column-count: 2; } }
@media (max-width: 540px) { .masonry { column-count: 1; } }
.gallery-item { break-inside: avoid; margin-bottom: 1rem; border-radius: 12px; overflow: hidden; background: white; box-shadow: 0 1px 4px rgba(0,0,0,0.06); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
.gallery-item:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.12); }
.gallery-item img { width: 100%; display: block; background: #e2e8f0; }
.gallery-item-caption { padding: 0.625rem 0.875rem; font-size: 0.8rem; color: #475569; line-height: 1.4; }
.loading { text-align: center; padding: 2rem; }
.spinner { width: 28px; height: 28px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto; }
@keyframes spin { to { transform: rotate(360deg); } }
.empty { text-align: center; color: #94a3b8; padding: 3rem 1rem; font-size: 0.95rem; }
.lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; flex-direction: column; z-index: 1000; padding: 2rem; }
.lightbox-close { position: absolute; top: 1rem; right: 1.25rem; background: transparent; border: none; color: white; font-size: 2rem; cursor: pointer; line-height: 1; }
.lightbox-img { max-width: 90vw; max-height: 80vh; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
.lightbox-caption { color: #e2e8f0; margin-top: 1rem; font-size: 0.95rem; max-width: 90vw; text-align: center; }`,
      js: `let allItems = [];

async function loadItems(query) {
  document.getElementById('gallery-loading').style.display = 'block';
  document.getElementById('gallery-empty').style.display = 'none';
  document.getElementById('masonry').innerHTML = '';
  try {
    const _baseUrl = "${
      context.apis[0]?.authType !== 'none'
        ? '/api/v1/proxy?apiId=' +
          (context.apis[0]?.id ?? '') +
          '&proxyPath=' +
          encodeURIComponent(context.apis[0]?.endpoints[0]?.path ?? '/search')
        : (context.apis[0]?.baseUrl ?? 'https://api.example.com') +
          (context.apis[0]?.endpoints[0]?.path ?? '/search')
    }";
    const _sep = _baseUrl.includes('?') ? '&' : '?';
    const _url = query ? _baseUrl + _sep + 'q=' + encodeURIComponent(query) : _baseUrl;
    const _res = await fetch(_url);
    if (!_res.ok) throw new Error('HTTP ' + _res.status);
    const _json = await _res.json();
    const _raw = _json${
      context.apis[0]?.endpoints[0]?.responseDataPath
        ? '.' + context.apis[0].endpoints[0].responseDataPath
        : ''
    } ?? _json.results ?? _json.hits ?? _json.photos ?? _json.data ?? _json;
    allItems = (Array.isArray(_raw) ? _raw : []).map(item => ({
      id: item.id ?? item.url ?? Math.random(),
      src: item.urls?.regular ?? item.webformatURL ?? item.src?.large ?? item.image ?? item.url ?? '',
      thumb: item.urls?.small ?? item.previewURL ?? item.src?.medium ?? item.thumbnail ?? item.image ?? item.url ?? '',
      caption: item.alt_description ?? item.description ?? item.tags ?? item.title ?? item.user ?? '',
    })).filter(it => it.src || it.thumb);
    renderItems();
  } catch (err) {
    document.getElementById('masonry').innerHTML = '<p style="color:#ef4444;text-align:center;padding:2rem">데이터를 불러오지 못했습니다.</p>';
  } finally {
    document.getElementById('gallery-loading').style.display = 'none';
  }
}

function renderItems() {
  const grid = document.getElementById('masonry');
  if (allItems.length === 0) {
    document.getElementById('gallery-empty').style.display = 'block';
    return;
  }
  grid.innerHTML = allItems.map(it =>
    '<div class="gallery-item" data-id="' + it.id + '">' +
      '<img src="' + (it.thumb || it.src) + '" alt="' + (it.caption || '') + '" loading="lazy"/>' +
      (it.caption ? '<div class="gallery-item-caption">' + it.caption + '</div>' : '') +
    '</div>'
  ).join('');
  grid.querySelectorAll('.gallery-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el instanceof HTMLElement ? el.dataset['id'] : null) ?? '';
      const item = allItems.find(it => String(it.id) === id);
      if (item) openLightbox(item);
    });
  });
}

function openLightbox(item) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');
  if (img instanceof HTMLImageElement) img.src = item.src || item.thumb;
  if (cap) cap.textContent = item.caption || '';
  if (lb) lb.style.display = 'flex';
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.style.display = 'none';
}

document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
document.getElementById('lightbox')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeLightbox();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

document.getElementById('search-btn')?.addEventListener('click', () => {
  const input = document.getElementById('search-input');
  const q = input instanceof HTMLInputElement ? input.value.trim() : '';
  loadItems(q);
});
document.getElementById('search-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const input = e.target instanceof HTMLInputElement ? e.target : null;
    loadItems(input?.value.trim() ?? '');
  }
});

loadItems('');`,
      promptHint: `Layout: masonry-gallery
Required sections (in order): 제목/설명 헤더, 검색바(input + 버튼), 마소닉 그리드, 라이트박스 모달
UI patterns: CSS column-count 3(데스크탑)/2(태블릿)/1(모바일), break-inside: avoid 카드, 클릭 시 라이트박스 오픈
State management: x-data="{ items: [], query: '', loading: true, error: null, selected: null }" x-init="loadItems('')"
Search: input @keydown.enter="loadItems(query)" and 검색 버튼 @click="loadItems(query)"
Lightbox: <div x-show="selected" x-transition @click.self="selected = null" @keydown.escape.window="selected = null">로 모달, 닫기 버튼·배경 클릭·ESC 키 모두 닫힘
Image grid: x-for="item in items" :key="item.id" with @click="selected = item", img loading="lazy"
Loading: x-show="loading" 스피너, 빈 결과 x-show="!loading && items.length === 0" 메시지
Must include: Alpine.js CDN, 마소닉 레이아웃(column-count), 검색 후 재조회, 라이트박스 키보드(ESC) 접근성, DOMContentLoaded API fetch(), no hardcoded image URLs, no picsum.photos
Avoid: 무한 스크롤, 카테고리 탭, 차트, 지도`,
    };
  }
}
