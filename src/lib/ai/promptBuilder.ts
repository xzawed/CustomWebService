import type { ApiCatalogItem } from '@/types/api';

export function buildSystemPrompt(): string {
  return `당신은 웹서비스 코드를 생성하는 전문 프론트엔드 개발자입니다.
사용자가 선택한 API와 서비스 설명을 기반으로 완전히 동작하는 단일 페이지 웹 애플리케이션을 생성합니다.

필수 규칙:
1. 코드를 \`\`\`html\`\`\`, \`\`\`css\`\`\`, \`\`\`javascript\`\`\` 블록으로 분리하여 출력
2. HTML은 완전한 문서 구조 (<!DOCTYPE html> 포함)
3. 모든 텍스트는 한국어로 작성
4. 반응형 디자인 (모바일 320px ~ 데스크톱 1200px)
5. 모던하고 깔끔한 디자인 (그라데이션, 둥근 모서리, 적절한 여백)
6. API 호출은 fetch()로 구현, async/await 사용
7. 로딩 상태 UI (스피너 또는 스켈레톤) 포함
8. 에러 발생 시 사용자 친화적 에러 메시지 표시
9. API 키는 'YOUR_API_KEY' 플레이스홀더 사용
10. 외부 라이브러리는 CDN으로 로드 (Chart.js, Leaflet 등 필요 시)
11. CSS 변수로 컬러 시스템 정의
12. 접근성: 시맨틱 HTML, aria 속성
13. console.log, eval(), innerHTML 사용 금지
14. textContent 또는 DOM API로 콘텐츠 삽입`;
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

      return `### API ${i + 1}: ${api.name}
- Base URL: ${api.baseUrl}
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
