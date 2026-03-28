import type { ApiCatalogItem } from '@/types/api';

export function buildSystemPrompt(): string {
  return `당신은 세계 최고 수준의 프론트엔드 개발자입니다. Notion, Linear, Vercel Dashboard처럼 실제 서비스에서 사용되는 완성도 높은 웹앱을 단일 HTML 파일로 생성합니다.

## 핵심 목표: 진짜 완성된 제품
기능이 "있어 보이는" 수준이 아닌, 실제로 동작하는 모든 기능을 구현합니다.
모든 버튼, 탭, 필터, 폼이 실제로 동작해야 합니다.

## 기술 스택 (반드시 포함)
\`\`\`html
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
\`\`\`

## 디자인 시스템 (CSS 변수)
\`\`\`css
:root {
  --bg: #060912;
  --bg-card: #0f1629;
  --bg-surface: #151f35;
  --bg-hover: #1a2540;
  --border: rgba(255,255,255,0.07);
  --border-active: rgba(0,212,255,0.3);
  --text: #f0f4ff;
  --text-2: #8b99b8;
  --text-3: #4a5568;
  --cyan: #00d4ff;
  --violet: #9b6dff;
  --emerald: #00e5a0;
  --amber: #ffb547;
  --rose: #ff4f7b;
  --blue: #4f8ef7;
  --grad: linear-gradient(135deg, #00d4ff, #4f8ef7, #9b6dff);
  --grad-warm: linear-gradient(135deg, #ffb547, #ff4f7b);
  --shadow: 0 4px 24px rgba(0,0,0,0.4);
  --radius: 12px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Pretendard', -apple-system, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: var(--bg); } ::-webkit-scrollbar-thumb { background: var(--bg-surface); border-radius: 3px; }
\`\`\`

## 필수 구현 섹션 (전부 포함)

### 1. 고정 헤더 (sticky top)
- 좌: 로고 아이콘 + 서비스명 (그라디언트 텍스트)
- 중: 주요 탭 네비게이션 (2~4개)
- 우: 검색 버튼, 알림 배지, 사용자 아바타

### 2. KPI 통계 카드 영역 (4~6개)
각 카드에 포함:
- 아이콘 (Font Awesome)
- 지표명 + 수치 (큰 폰트, 그라디언트)
- 전주/전월 대비 변화율 (▲ 상승 emerald / ▼ 하락 rose)
- 미니 스파크라인 또는 진행 바

### 3. 메인 데이터 영역
옵션 A - 데이터 테이블:
- 정렬 가능한 컬럼 헤더 (클릭 시 ▲▼ 토글)
- 행 호버 하이라이트
- 체크박스 다중선택
- 상태 배지 (colored pill)
- 각 행에 수정/삭제 액션 버튼

옵션 B - 카드 그리드 (3~4열):
- 이미지/아이콘 영역
- 제목, 설명, 메타 정보
- 상태 배지
- 좋아요/북마크 토글 버튼
- 카드 클릭 → 상세 모달

### 4. 검색 & 필터 바
\`\`\`html
<!-- 검색 + 필터 조합 -->
<div class="flex gap-3">
  <input type="text" id="searchInput" placeholder="검색..." oninput="handleSearch(this.value)">
  <select onchange="handleFilter(this.value)">
    <option value="all">전체</option>
    <option value="active">활성</option>
    <option value="inactive">비활성</option>
  </select>
  <select onchange="handleSort(this.value)">
    <option value="date-desc">최신순</option>
    <option value="date-asc">오래된순</option>
    <option value="name">이름순</option>
  </select>
</div>
\`\`\`

### 5. 모달 시스템 (필수 구현)
- 항목 추가 모달: 폼 필드 3개 이상, 유효성 검사
- 항목 상세 모달: 전체 정보 + 편집 버튼
- 삭제 확인 모달: "정말 삭제하시겠습니까?"
- 배경 클릭 또는 ESC 키로 닫기

### 6. 사이드바 패널 (선택 항목 클릭 시)
오른쪽에서 슬라이드인 되는 상세 패널:
\`\`\`css
.sidebar { position:fixed; right:0; top:0; height:100vh; width:400px; background:var(--bg-card);
  transform:translateX(100%); transition:transform 0.3s ease; z-index:200; }
.sidebar.open { transform:translateX(0); }
\`\`\`

### 7. 토스트 알림 (모든 액션에 표시)
\`\`\`javascript
function showToast(msg, type='success') {
  const t = document.createElement('div');
  t.className = \`toast toast-\${type}\`;
  t.textContent = msg;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
// 사용: showToast('저장되었습니다', 'success'), showToast('삭제 실패', 'error')
\`\`\`

### 8. 차트/시각화 (Chart.js)
최소 1개 이상 포함 (라인차트 또는 바차트):
\`\`\`javascript
new Chart(ctx, {
  type: 'line',
  data: { labels: [...], datasets: [{ data: [...], borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.1)', fill: true, tension: 0.4 }] },
  options: { plugins: { legend: { labels: { color: '#8b99b8' } } }, scales: { x: { ticks: { color: '#8b99b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#8b99b8' }, grid: { color: 'rgba(255,255,255,0.05)' } } }, responsive: true, maintainAspectRatio: false }
});
\`\`\`

### 9. 탭 시스템
\`\`\`javascript
// 탭 전환: 최소 2~3개 탭 (전체 / 카테고리별 / 즐겨찾기 등)
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId).classList.remove('hidden');
  event.target.classList.add('active');
}
\`\`\`

### 10. 페이지네이션
\`\`\`javascript
let currentPage = 1; const PAGE_SIZE = 10;
function renderPage(data) {
  const start = (currentPage-1)*PAGE_SIZE, end = start+PAGE_SIZE;
  renderTable(data.slice(start, end));
  renderPagination(data.length);
}
\`\`\`

## 목 데이터 요구사항
- **최소 20개 이상** 현실적인 한국어 데이터 항목
- 다양한 상태값 포함 (active/inactive/pending/completed 등)
- 날짜는 최근 6개월 내 분산
- 금액은 한국 원화 기준 (₩ 표시)
- 실제 존재할 법한 이름/회사명/제품명 사용

## API 호출 규칙
- auth_type이 'api_key'인 API → 반드시 서버 프록시:
  \`fetch('/api/v1/proxy?apiId=<ID>&proxyPath=<경로>&파라미터=값')\`
- auth_type이 'none'인 API → base_url로 직접 fetch()
- 'YOUR_API_KEY' 절대 사용 금지

## 데이터 로딩 전략
1. 페이지 로드 즉시 목 데이터 렌더링 (사용자가 바로 내용 확인)
2. 백그라운드에서 실제 API 호출
3. 성공 시 목 데이터를 실제 데이터로 교체
4. 실패 시 목 데이터 유지 + 우측 하단 작은 배지로 안내

## 반응형
- 모바일(< 768px): 1열, 사이드바 대신 전체화면 모달
- 태블릿(768~1024px): 2열
- 데스크톱(> 1024px): 3~4열, 풀 레이아웃

## 절대 금지
- eval(), innerHTML 직접 사용 금지 (textContent, createElement 사용)
- 무한 로딩 스피너만 있는 화면 금지
- 기능 없는 장식용 버튼 금지
- 플레이스홀더 API 키 금지
- "준비 중", "Coming Soon" 섹션 금지`;
}

export function buildUserPrompt(apis: ApiCatalogItem[], context: string, projectId?: string): string {
  const apiDescriptions = apis
    .map((api, i) => {
      const endpoints = api.endpoints
        .map(
          (ep) =>
            `  - ${ep.method} ${ep.path}: ${ep.description}\n    파라미터: ${JSON.stringify(ep.params)}\n    응답 예시: ${JSON.stringify(ep.responseExample)}`
        )
        .join('\n');

      const projectParam = projectId ? `&projectId=${projectId}` : '';
      const callMethod =
        api.authType === 'none'
          ? `직접 fetch (인증 불필요): ${api.baseUrl}`
          : `서버 프록시 필수: /api/v1/proxy?apiId=${api.id}${projectParam}&proxyPath=<경로>&<파라미터>=<값>`;

      return `### API ${i + 1}: ${api.name}
- API ID (프록시 호출 시 사용): ${api.id}
- 호출 방법: ${callMethod}
- 인증 방식: ${api.authType}
- 호출 제한: ${api.rateLimit ?? '무제한'}
- 주요 엔드포인트:
${endpoints}`;
    })
    .join('\n\n');

  return `## 선택된 API 목록

${apiDescriptions}

## 사용자 요청
${context}

## 생성 요구사항
위 API들을 활용하여 사용자 요청에 맞는 완성도 높은 웹서비스를 생성해주세요.

### 반드시 포함해야 할 기능 체크리스트
- [ ] 고정 헤더 + 탭 네비게이션 (2개 이상 탭, 실제 동작)
- [ ] KPI/통계 카드 4개 이상 (아이콘, 수치, 변화율 포함)
- [ ] 데이터 목록/테이블 (20개 이상 목 데이터, 정렬 기능)
- [ ] 실시간 검색바 (타이핑 즉시 필터링)
- [ ] 카테고리/상태 필터 드롭다운
- [ ] 항목 추가 모달 (폼 + 유효성 검사 + 실제 목록 추가)
- [ ] 항목 상세 보기 (모달 또는 사이드 패널)
- [ ] 삭제 기능 (확인 다이얼로그 포함)
- [ ] 토스트 알림 (모든 액션 후 피드백)
- [ ] Chart.js 차트 1개 이상 (서비스 맥락에 맞는 시각화)
- [ ] 페이지네이션 (10개 단위)
- [ ] 반응형 레이아웃

### API 호출
- auth_type이 'api_key'인 API → 반드시 /api/v1/proxy?apiId=... 프록시 사용
- 페이지 로드 즉시 목 데이터 표시 후 실제 API 백그라운드 호출

### 코드 반환 형식

### HTML
\`\`\`html
(CDN 포함한 완전한 HTML 문서. <head>에 모든 스크립트/스타일 포함)
\`\`\`

### CSS
\`\`\`css
(추가 CSS. 애니메이션, 트랜지션, 커스텀 컴포넌트 스타일 포함)
\`\`\`

### JavaScript
\`\`\`javascript
(완전한 JS. 목 데이터 20개+, 모든 이벤트 핸들러, API 호출, 상태 관리)
\`\`\``;
}

export function buildRegenerationPrompt(
  previousCode: { html: string; css: string; js: string },
  feedback: string,
  apis: ApiCatalogItem[] = []
): string {
  const apiSection = apis.length > 0
    ? `## 프로젝트에 연결된 API (반드시 활용)
${apis.map((api) => {
  const projectParam = '';
  const callMethod =
    api.authType === 'none'
      ? `직접 fetch: ${api.baseUrl}`
      : `서버 프록시: /api/v1/proxy?apiId=${api.id}${projectParam}&proxyPath=<경로>`;
  return `### ${api.name} (ID: ${api.id})
- 호출 방법: ${callMethod}
- 인증: ${api.authType}`;
}).join('\n\n')}

`
    : '';

  return `${apiSection}## 이전 생성 코드

### HTML
\`\`\`html
${previousCode.html}
\`\`\`

### CSS
\`\`\`css
${previousCode.css}
\`\`\`

### JavaScript
\`\`\`javascript
${previousCode.js}
\`\`\`

## 사용자 수정 요청
${feedback}

위 피드백을 반영하여 코드를 수정해주세요.
- 수정 요청에 언급되지 않은 기존 기능은 그대로 유지하세요.
- 위에 명시된 API가 코드에 없다면 자연스럽게 통합해주세요.
- 전체 코드를 반환해주세요.

다음 형식으로 코드를 반환해주세요:

### HTML
\`\`\`html
(완전한 HTML 코드)
\`\`\`

### CSS
\`\`\`css
(CSS 코드)
\`\`\`

### JavaScript
\`\`\`javascript
(JavaScript 코드)
\`\`\``;
}
