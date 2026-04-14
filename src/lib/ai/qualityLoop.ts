import type { QualityMetrics } from '@/lib/ai/codeValidator';
import type { QcReport } from '@/types/qc';
import { QC_THRESHOLDS } from '@/lib/config/qc';

export function shouldRetryGeneration(
  metrics: QualityMetrics,
  qcReport?: QcReport | null
): boolean {
  if (metrics.structuralScore < QC_THRESHOLDS.QUALITY) return true;
  if (metrics.mobileScore < QC_THRESHOLDS.MOBILE) return true;
  if (qcReport) {
    const consoleCheck = qcReport.checks.find(c => c.name === 'consoleErrors');
    const scrollCheck = qcReport.checks.find(c => c.name === 'horizontalScroll');
    const footerCheck = qcReport.checks.find(c => c.name === 'footerVisible');
    const overlapCheck = qcReport.checks.find(c => c.name === 'noLayoutOverlap');
    if (consoleCheck && !consoleCheck.passed) return true;
    if (scrollCheck && !scrollCheck.passed) return true;
    if (footerCheck && !footerCheck.passed) return true;
    if (overlapCheck && !overlapCheck.passed) return true;
  }
  // New: retry if no fetch calls or placeholder strings present
  if (metrics.fetchCallCount === 0) return true;
  if (metrics.placeholderCount > 0) return true;
  return false;
}

export function buildQualityImprovementPrompt(
  previousCode: { html: string; css: string; js: string },
  metrics: QualityMetrics,
  qcReport?: QcReport | null
): string {
  const issues = metrics.details.map((d) => `- ${d}`).join('\n');
  const qcIssues = qcReport
    ? qcReport.checks
        .filter(c => !c.passed)
        .map(c => {
          const detailStr = c.details.length > 0 ? ` (${c.details.join(', ')})` : '';
          return `- [렌더링 QC] ${c.name}${detailStr}`;
        })
        .join('\n')
    : '';

  // 토큰 최적화: 전체 코드 대신 앞부분만 전송 (50-70% 절감)
  const htmlLines = previousCode.html.split('\n');
  const jsLines = previousCode.js.split('\n');
  const htmlPreview = htmlLines.slice(0, 200).join('\n');
  const jsPreview = jsLines.slice(0, 100).join('\n');

  return `## 이전 생성 코드 (요약)

### HTML${htmlLines.length > 200 ? ' (처음 200줄)' : ''}
\`\`\`html
${htmlPreview}
\`\`\`

### CSS
\`\`\`css
${previousCode.css}
\`\`\`

### JavaScript${jsLines.length > 100 ? ' (처음 100줄)' : ''}
\`\`\`javascript
${jsPreview}
\`\`\`

## 품질 개선 요청

이전 코드의 품질 점수: 구조 ${metrics.structuralScore}/100, 모바일 ${metrics.mobileScore}/100 (기준: ${QC_THRESHOLDS.QUALITY}).
아래 문제를 반드시 수정하세요:

${issues}
${qcIssues ? `\n브라우저 렌더링 검증에서 발견된 추가 문제:\n${qcIssues}\n` : ''}
수정 규칙:
- 기존 기능과 디자인은 최대한 유지하면서 위 문제만 정확히 수정
- 시맨틱 HTML 태그(<main>, <nav>, <footer>, <article>) 사용
- 모든 <img>에 한국어 alt 속성 추가
- fetch() 호출이 없다면 반드시 추가하라
- placeholder 문자열을 제거하라: 홍길동, test@example.com, Loading..., 준비 중, 구현 예정
- <footer> 태그로 서비스명 + 저작권 + 링크 포함
- 반응형 클래스(sm:/md:/lg:)를 최소 8곳 이상 사용
- 고정 너비(w-[500px] 등) 제거 → max-w-lg, w-full 등으로 교체
- 모든 <img>에 w-full max-w-full 또는 object-cover 적용
- 모바일 네비게이션: hidden md:flex / md:hidden 패턴 적용
- 모든 버튼/링크에 py-3 이상의 터치 영역 확보
- 가로 스크롤이 발생하지 않도록 레이아웃 수정
- 브라우저에서 JavaScript 에러가 발생하지 않도록 코드 수정
- <footer>가 페이지 하단에 보이도록 확인

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
