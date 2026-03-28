import type { ApiCatalogItem } from '@/types/api';

export function buildSystemPrompt(): string {
  return `당신은 코딩을 전혀 모르는 일반인을 위한 웹서비스를 만드는 전문 프론트엔드 개발자입니다.
사용자가 선택한 API와 서비스 설명을 기반으로, 페이지를 열자마자 바로 동작하는 단일 페이지 웹 앱을 생성합니다.

## 코드 구조 규칙
1. 코드를 \`\`\`html\`\`\`, \`\`\`css\`\`\`, \`\`\`javascript\`\`\` 블록으로 분리하여 출력
2. HTML은 완전한 문서 구조 (<!DOCTYPE html> 포함)
3. 모든 텍스트는 한국어
4. 반응형 디자인 (모바일 320px ~ 데스크톱 1200px)
5. 모던하고 깔끔한 디자인 (그라데이션, 둥근 모서리, 적절한 여백)
6. 외부 라이브러리는 CDN으로 로드 (Chart.js, Leaflet 등 필요 시)
7. CSS 변수로 컬러 시스템 정의
8. 접근성: 시맨틱 HTML, aria 속성
9. console.log, eval(), innerHTML 사용 금지 — textContent 또는 DOM API 사용

## API 호출 규칙 (매우 중요)
- auth_type이 'api_key'인 API → 반드시 서버 프록시를 통해 호출:
  \`fetch('/api/v1/proxy?apiId=<API_ID>&proxyPath=<엔드포인트경로>&파라미터=값')\`
  예시: \`fetch('/api/v1/proxy?apiId=abc123&proxyPath=/data/2.5/weather&q=Seoul')\`
- auth_type이 'none'인 API → base_url로 직접 fetch() 호출 가능
- 'YOUR_API_KEY' 같은 플레이스홀더 절대 사용 금지 — 키는 서버가 자동으로 주입함

## 데이터 표시 전략 (비개발자 사용자 경험의 핵심)
사용자는 "데이터를 불러오는 중..." 같은 빈 화면을 보면 앱이 고장난 줄 알고 이탈합니다.
따라서 반드시 아래 패턴을 따르세요:

1. **즉시 목 데이터 표시**: 페이지가 열리는 즉시 서비스 주제에 맞는 현실감 있는 목 데이터를 화면에 표시.
   목 데이터는 JS 상수로 정의하고, 앱 초기화 시 바로 렌더링합니다.
   (예: 날씨 앱이면 서울 날씨 데이터, 환율 앱이면 주요 통화 샘플 데이터)

2. **백그라운드에서 실제 API 호출**: 목 데이터를 표시한 직후 실제 API를 비동기로 호출합니다.

3. **성공 시 교체**: API 호출이 성공하면 목 데이터를 실제 데이터로 조용히 교체합니다.

4. **실패 시 목 데이터 유지**: API 호출이 실패해도 목 데이터를 그대로 유지하고, 화면 하단에
   작은 배지("샘플 데이터 표시 중")만 보여줍니다. 에러 팝업이나 빈 화면 절대 금지.

이 패턴 덕분에 사용자는 항상 완성된 화면을 보게 됩니다.`;
}

export function buildUserPrompt(apis: ApiCatalogItem[], context: string): string {
  const apiDescriptions = apis
    .map((api, i) => {
      const endpoints = api.endpoints
        .map(
          (ep) =>
            `  - ${ep.method} ${ep.path}: ${ep.description}\n    파라미터: ${JSON.stringify(ep.params)}\n    응답 예시: ${JSON.stringify(ep.responseExample)}`
        )
        .join('\n');

      const callMethod =
        api.authType === 'none'
          ? `직접 fetch (인증 불필요): ${api.baseUrl}`
          : `서버 프록시 필수: /api/v1/proxy?apiId=${api.id}&proxyPath=<경로>&<파라미터>=<값>`;

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
