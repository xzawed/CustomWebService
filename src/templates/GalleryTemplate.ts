import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class GalleryTemplate implements ICodeTemplate {
  readonly id = 'gallery';
  readonly name = '갤러리';
  readonly description = '이미지/콘텐츠 그리드 갤러리';
  readonly category = 'gallery';
  readonly supportedApiCategories = ['이미지', '사진', '미디어', 'image', 'photo', 'media', 'unsplash', 'pixabay'];

  matchScore(apis: ApiCatalogItem[]): number {
    const matchingApis = apis.filter((api) =>
      this.supportedApiCategories.some(
        (cat) =>
          api.category.toLowerCase().includes(cat.toLowerCase()) ||
          api.name.toLowerCase().includes(cat.toLowerCase()) ||
          api.tags?.some((tag) => tag.toLowerCase().includes(cat.toLowerCase()))
      )
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
    <div class="controls">
      <input type="text" id="search" placeholder="검색어를 입력하세요..." />
      <div class="categories" id="categories">
        <button class="cat-btn active" data-category="all">전체</button>
        <button class="cat-btn" data-category="nature">자연</button>
        <button class="cat-btn" data-category="city">도시</button>
        <button class="cat-btn" data-category="people">사람</button>
      </div>
    </div>
    <div class="grid" id="grid"></div>
    <div class="loading" id="loading" style="display:none;">
      <div class="spinner"></div>
      <p>로딩 중...</p>
    </div>
    <div class="modal" id="modal" style="display:none;">
      <div class="modal-backdrop" onclick="closeModal()"></div>
      <div class="modal-content">
        <button class="modal-close" onclick="closeModal()">&times;</button>
        <img id="modal-img" src="" alt="" />
        <p id="modal-desc"></p>
      </div>
    </div>
  </div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #fafafa; }
.gallery-app { max-width: 1200px; margin: 0 auto; padding: 2rem; }
header h1 { font-size: 2rem; font-weight: 800; }
header p { color: #666; margin-top: 0.25rem; }
.controls { margin: 1.5rem 0; display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
#search { flex: 1; min-width: 200px; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 10px; font-size: 0.9rem; outline: none; }
#search:focus { border-color: #3b82f6; }
.categories { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.cat-btn { padding: 0.5rem 1rem; border: 1px solid #ddd; background: white; border-radius: 20px; cursor: pointer; font-size: 0.8rem; transition: all 0.2s; }
.cat-btn.active { background: #1e293b; color: white; border-color: #1e293b; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem; }
.grid-item { border-radius: 12px; overflow: hidden; cursor: pointer; position: relative; aspect-ratio: 4/3; background: #eee; }
.grid-item img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
.grid-item:hover img { transform: scale(1.05); }
.grid-item .overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 1rem; background: linear-gradient(transparent, rgba(0,0,0,0.7)); color: white; font-size: 0.8rem; opacity: 0; transition: opacity 0.3s; }
.grid-item:hover .overlay { opacity: 1; }
.loading { text-align: center; padding: 3rem; color: #999; }
.spinner { width: 36px; height: 36px; border: 3px solid #eee; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 0.5rem; }
@keyframes spin { to { transform: rotate(360deg); } }
.modal { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; }
.modal-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.6); }
.modal-content { position: relative; background: white; border-radius: 16px; overflow: hidden; max-width: 90vw; max-height: 90vh; }
.modal-content img { max-width: 100%; max-height: 80vh; display: block; }
.modal-content p { padding: 1rem; font-size: 0.875rem; color: #333; }
.modal-close { position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(0,0,0,0.5); color: white; border: none; border-radius: 50%; width: 32px; height: 32px; font-size: 1.25rem; cursor: pointer; z-index: 1; }`,
      js: `let items = [];
let currentCategory = 'all';

async function loadItems(query) {
  const loading = document.getElementById('loading');
  loading.style.display = 'block';

  try {
    // 실제 API 호출로 교체
    items = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      title: (query || '항목') + ' ' + (i + 1),
      image: 'https://picsum.photos/400/300?random=' + i + '&t=' + Date.now(),
      category: ['nature', 'city', 'people'][i % 3],
    }));
    renderGrid();
  } catch (err) {
    document.getElementById('grid').innerHTML = '<p style="color:#999;grid-column:1/-1;text-align:center;">데이터를 불러올 수 없습니다.</p>';
  } finally {
    loading.style.display = 'none';
  }
}

function renderGrid() {
  const grid = document.getElementById('grid');
  const filtered = currentCategory === 'all' ? items : items.filter(item => item.category === currentCategory);

  grid.innerHTML = filtered.map(item =>
    '<div class="grid-item" onclick="openModal(\\'' + item.image + '\\', \\'' + item.title + '\\')">' +
      '<img src="' + item.image + '" alt="' + item.title + '" loading="lazy" />' +
      '<div class="overlay">' + item.title + '</div>' +
    '</div>'
  ).join('');
}

function openModal(imgSrc, desc) {
  document.getElementById('modal-img').src = imgSrc;
  document.getElementById('modal-desc').textContent = desc;
  document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

// Category filter
document.getElementById('categories').addEventListener('click', (e) => {
  if (e.target.classList.contains('cat-btn')) {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentCategory = e.target.dataset.category;
    renderGrid();
  }
});

// Search with debounce
let searchTimer;
document.getElementById('search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadItems(e.target.value), 300);
});

// ESC to close modal
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

loadItems('');`,
      promptHint:
        '이 갤러리 템플릿을 기반으로, 선택된 API에서 실제 이미지/콘텐츠 데이터를 가져오도록 수정하고, 무한 스크롤과 상세 모달을 개선해주세요.',
    };
  }
}
