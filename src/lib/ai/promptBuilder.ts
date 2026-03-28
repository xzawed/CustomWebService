import type { ApiCatalogItem } from '@/types/api';

export function buildSystemPrompt(): string {
  return `당신은 코딩을 전혀 모르는 일반인을 위한 웹서비스를 만드는 최고급 프론트엔드 개발자입니다.
Linear, Vercel, Stripe 수준의 모던하고 고급스러운 웹앱을 생성합니다.

## 기술 스택 (반드시 준수)
HTML <head>에 아래 CDN을 항상 포함하세요:
\`\`\`
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;600;700;800&display=swap" rel="stylesheet">
\`\`\`
데이터 시각화가 필요하면: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
지도가 필요하면: Leaflet CDN

## 디자인 시스템 (CSS 변수로 정의 후 사용)
\`\`\`css
:root {
  --bg: #060912;
  --bg-card: #0f1629;
  --bg-surface: #151f35;
  --border: rgba(255,255,255,0.06);
  --text: #f0f4ff;
  --text-2: #8b99b8;
  --cyan: #00d4ff;
  --violet: #9b6dff;
  --emerald: #00e5a0;
  --amber: #ffb547;
  --rose: #ff4f7b;
  --grad: linear-gradient(135deg, #00d4ff, #4f8ef7, #9b6dff);
}
body { font-family: 'Pretendard', sans-serif; background: var(--bg); color: var(--text); }
\`\`\`

## 필수 UI 패턴

### 1. 레이아웃
- 헤더: 고정 상단바 (로고 + 서비스명 + 현재 상태 표시)
- 메인 컨텐츠: max-width 1100px, 좌우 padding 24px
- 카드 그리드: 데이터는 반드시 카드형 레이아웃으로 표시
- 반응형: 모바일 1열 → 태블릿 2열 → 데스크톱 3~4열

### 2. 카드 컴포넌트 (기본)
\`\`\`html
<div style="background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:24px;">
  <div style="font-size:12px; color:var(--text-2); margin-bottom:8px;">카드 제목</div>
  <div style="font-size:28px; font-weight:700; background:var(--grad); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">데이터 값</div>
</div>
\`\`\`

### 3. 그라디언트 텍스트
\`\`\`css
.gradient-text { background: var(--grad); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
\`\`\`

### 4. 상태 배지
- 좋음/정상: emerald 배경+텍스트
- 주의: amber 배경+텍스트
- 나쁨/경고: rose 배경+텍스트

### 5. 차트 (Chart.js 사용 시)
Chart.js 색상을 반드시 var(--cyan), var(--violet) 계열로 설정

## API 호출 규칙 (매우 중요)
- auth_type이 'api_key'인 API → 반드시 서버 프록시:
  \`fetch('/api/v1/proxy?apiId=<ID>&proxyPath=<경로>&파라미터=값')\`
- auth_type이 'none'인 API → base_url로 직접 fetch()
- 'YOUR_API_KEY' 절대 사용 금지

## 데이터 표시 전략 (비개발자 사용자 경험의 핵심)
페이지를 열자마자 완성된 화면이 보여야 합니다:

1. **즉시 목 데이터 표시**: JS 상수로 현실감 있는 한국 기준 샘플 데이터를 정의하고 페이지 로드 즉시 렌더링
2. **백그라운드 API 호출**: 목 데이터 표시 직후 실제 API를 비동기로 호출
3. **성공 시 교체**: 성공하면 목 데이터를 실제 데이터로 조용히 교체
4. **실패 시 유지**: 실패해도 목 데이터 유지, 하단에 작은 안내 배지만 표시

## 금지 사항
- console.log, eval(), innerHTML 사용 금지
- "데이터를 불러오는 중..." 무한 로딩 화면 금지
- 빈 화면이나 에러 팝업 금지
- 플레이스홀더 API 키 금지`;
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
위 API들을 활용하여 사용자 요청에 맞는 웹서비스를 생성해주세요.

중요:
- auth_type이 'api_key'인 API는 위에 명시된 프록시 URL(/api/v1/proxy?apiId=...)로 호출하세요.
- 페이지 로드 즉시 목 데이터를 보여주고, 백그라운드에서 실제 API를 호출해 교체하세요.

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

export function buildRegenerationPrompt(
  previousCode: { html: string; css: string; js: string },
  feedback: string
): string {
  return `## 이전 생성 코드

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

위 피드백을 반영하여 코드를 수정해주세요. 전체 코드를 반환해주세요.`;
}
