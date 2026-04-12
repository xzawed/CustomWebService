import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class MapServiceTemplate implements ICodeTemplate {
  readonly id = 'map-service';
  readonly name = '지도 서비스';
  readonly description = 'Leaflet 지도 기반 위치 서비스';
  readonly category = 'map';
  readonly supportedApiCategories = ['지도', '위치', '장소', 'map', 'location', 'place', 'geo'];

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
      html: `<div class="map-app">
    <div class="sidebar">
      <div class="sidebar-header">
        <h1>지도 서비스</h1>
        <p>${context.userContext.slice(0, 60)}</p>
        <input type="text" id="place-search" placeholder="장소 검색..." />
      </div>
      <ul class="place-list" id="place-list">
        <li class="place-item loading-item">로딩 중...</li>
      </ul>
    </div>
    <div id="map"></div>
  </div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; }
body { font-family: 'Segoe UI', system-ui, sans-serif; }
.map-app { display: flex; height: 100vh; }
.sidebar { width: 320px; flex-shrink: 0; background: white; box-shadow: 2px 0 8px rgba(0,0,0,0.08); overflow-y: auto; z-index: 10; display: flex; flex-direction: column; }
.sidebar-header { padding: 1.25rem; border-bottom: 1px solid #e2e8f0; }
.sidebar-header h1 { font-size: 1.1rem; font-weight: 700; color: #1e293b; }
.sidebar-header p { font-size: 0.75rem; color: #64748b; margin-top: 0.2rem; margin-bottom: 0.75rem; }
#place-search { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.875rem; outline: none; }
#place-search:focus { border-color: #3b82f6; }
.place-list { list-style: none; flex: 1; }
.place-item { padding: 1rem 1.25rem; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.15s; }
.place-item:hover { background: #f8fafc; }
.place-item.active { background: #eff6ff; border-left: 3px solid #3b82f6; }
.place-item .place-name { font-weight: 600; font-size: 0.875rem; color: #1e293b; }
.place-item .place-desc { font-size: 0.75rem; color: #64748b; margin-top: 0.2rem; }
.loading-item { color: #94a3b8; font-size: 0.875rem; }
#map { flex: 1; z-index: 1; }`,
      js: `// Leaflet CDN 필요: https://unpkg.com/leaflet@1.9.4/dist/leaflet.css
// <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
let map;
let markers = [];
let places = [];

function initMap() {
  map = L.map('map').setView([37.5665, 126.9780], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  loadPlaces();
}

async function loadPlaces() {
  try {
    // 실제 API 호출로 교체
    places = [
      { id: 1, name: '장소 1', desc: '설명 1', lat: 37.5665, lng: 126.9780 },
      { id: 2, name: '장소 2', desc: '설명 2', lat: 37.5700, lng: 126.9820 },
      { id: 3, name: '장소 3', desc: '설명 3', lat: 37.5630, lng: 126.9740 },
    ];
    renderList(places);
    addMarkers(places);
  } catch (err) {
    document.getElementById('place-list').innerHTML = '<li class="place-item" style="color:#ef4444">데이터 로드 실패</li>';
  }
}

function renderList(items) {
  const list = document.getElementById('place-list');
  list.innerHTML = items.map(p =>
    '<li class="place-item" data-id="' + p.id + '" onclick="focusPlace(' + p.id + ')">' +
      '<div class="place-name">' + p.name + '</div>' +
      '<div class="place-desc">' + p.desc + '</div>' +
    '</li>'
  ).join('');
}

function addMarkers(items) {
  markers.forEach(m => map.removeLayer(m));
  markers = items.map(p => {
    const m = L.marker([p.lat, p.lng]).addTo(map).bindPopup('<b>' + p.name + '</b><br>' + p.desc);
    return m;
  });
}

function focusPlace(id) {
  const p = places.find(pl => pl.id === id);
  if (!p) return;
  map.setView([p.lat, p.lng], 15);
  const markerIdx = places.indexOf(p);
  if (markers[markerIdx]) markers[markerIdx].openPopup();
  document.querySelectorAll('.place-item').forEach(el => el.classList.remove('active'));
  const el = document.querySelector('.place-item[data-id="' + id + '"]');
  if (el) el.classList.add('active');
}

let searchTimer;
document.getElementById('place-search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = e.target.value.toLowerCase();
    const filtered = q ? places.filter(p => p.name.toLowerCase().includes(q)) : places;
    renderList(filtered);
    addMarkers(filtered);
  }, 300);
});

if (typeof L !== 'undefined') initMap();
else console.warn('Leaflet이 로드되지 않았습니다. CDN 링크를 추가하세요.');`,
      promptHint: `Layout: map-sidebar
Required sections (in order): 사이드바(검색바 + 항목 리스트), Leaflet 지도(우측 메인)
UI patterns: 좌우 분할 레이아웃(사이드바 320px + 지도 flex:1), 마커 클릭 시 팝업
Must include: Leaflet.js CDN, OpenStreetMap 타일, 검색 필터링(300ms 디바운스), 마커 + 팝업
Avoid: 전체 페이지 스크롤, 테이블 레이아웃, 차트`,
    };
  }
}
