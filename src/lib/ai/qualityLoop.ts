import type { QualityMetrics } from '@/lib/ai/codeValidator';

const QUALITY_THRESHOLD = 40;

export function shouldRetryGeneration(metrics: QualityMetrics): boolean {
  return metrics.structuralScore < QUALITY_THRESHOLD;
}

export function buildQualityImprovementPrompt(
  previousCode: { html: string; css: string; js: string },
  metrics: QualityMetrics
): string {
  const issues = metrics.details.map((d) => `- ${d}`).join('\n');

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

## 품질 개선 요청

이전 코드의 품질 점수가 ${metrics.structuralScore}/100으로 기준(${QUALITY_THRESHOLD}) 미달입니다.
아래 문제를 반드시 수정하세요:

${issues}

수정 규칙:
- 기존 기능과 디자인은 최대한 유지하면서 위 문제만 정확히 수정
- 시맨틱 HTML 태그(<main>, <nav>, <footer>, <article>) 사용
- 모든 <img>에 한국어 alt 속성 추가
- 목 데이터가 없다면 const 배열로 최소 15개 추가
- <footer> 태그로 서비스명 + 저작권 + 링크 포함
- 반응형 클래스(sm:/md:/lg:) 사용
- addEventListener로 인터랙션 추가 (탭, 검색, 모달)

전체 코드를 반환해주세요:

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
