import { evaluateQuality } from '@/lib/ai/codeValidator';
import type { QualityMetrics } from '@/lib/ai/codeValidator';
import type { QcReport } from '@/types/qc';
import { QC_THRESHOLDS } from '@/lib/config/qc';
import { runFastQc, isQcEnabled } from '@/lib/qc';
import { parseGeneratedCode } from '@/lib/ai/codeParser';
import { assembleHtml } from '@/lib/ai/codeParser';
import { generationTracker } from '@/lib/ai/generationTracker';
import { logger } from '@/lib/utils/logger';
import type { IAiProvider } from '@/providers/ai/IAiProvider';
import type { SseWriter } from '@/lib/ai/sseWriter';

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
  // Retry if fetch calls exist but none use the proxy (likely CORS-failing direct API calls)
  if (!metrics.hasProxyCall && metrics.fetchCallCount > 0) return true;
  // Retry if hardcoded array data is present (mock data instead of real API calls)
  if (metrics.hardcodedArrayCount > 0) return true;
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

  return `## 이전 생성 코드 (전체)

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

이전 코드의 품질 점수: 구조 ${metrics.structuralScore}/100, 모바일 ${metrics.mobileScore}/100 (기준: ${QC_THRESHOLDS.QUALITY}).
아래 문제를 반드시 수정하세요:

${issues}
${qcIssues ? `\n브라우저 렌더링 검증에서 발견된 추가 문제:\n${qcIssues}\n` : ''}
수정 규칙:
- 기존 기능과 디자인은 최대한 유지하면서 위 문제만 정확히 수정
- 시맨틱 HTML 태그(<main>, <nav>, <footer>, <article>) 사용
- 모든 <img>에 한국어 alt 속성 추가
- fetch() 호출이 없다면 반드시 추가하라
- 모든 fetch() 호출은 반드시 /api/v1/proxy 경로를 통해야 한다 — 외부 URL 직접 호출은 CORS 오류 발생
- 하드코딩된 배열 데이터(const items = [...])는 제거하고 /api/v1/proxy를 통한 실제 API 호출로 교체
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

function safeAssembleHtml(code: { html: string; css: string; js: string }): string | null {
  try {
    return assembleHtml(code);
  } catch {
    return null;
  }
}

export interface QualityLoopResult {
  parsed: { html: string; css: string; js: string };
  quality: ReturnType<typeof evaluateQuality>;
  qcReport: QcReport | null;
  qualityLoopUsed: boolean;
}

/** 품질 기준 미달 시 최대 3회 재생성 시도, 최선 버전 반환 */
export async function runQualityLoop(
  initialParsed: { html: string; css: string; js: string },
  initialQuality: ReturnType<typeof evaluateQuality>,
  initialQcReport: QcReport | null,
  stage2SystemPrompt: string,
  aiProvider: IAiProvider,
  sse: SseWriter,
  useET: boolean,
  projectId: string,
): Promise<QualityLoopResult> {
  let bestParsed = initialParsed;
  let bestQuality = initialQuality;
  let bestQcReport = initialQcReport;
  let qualityLoopUsed = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (!shouldRetryGeneration(bestQuality, bestQcReport)) break;

    logger.info('Quality below threshold, attempting improvement', {
      projectId,
      score: bestQuality.structuralScore,
      attempt: attempt + 1,
    });

    sse.send('progress', { step: 'quality_improvement', progress: 92, message: '품질 개선 중...' });
    generationTracker.updateProgress(projectId, 92, 'quality_improvement', '품질 개선 중...');

    try {
      const improvementPrompt = buildQualityImprovementPrompt(bestParsed, bestQuality, bestQcReport);
      const iterationTimeoutMs = Number(process.env.QUALITY_LOOP_ITERATION_TIMEOUT_MS ?? 120_000);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Quality loop iteration timed out after ${iterationTimeoutMs}ms`)),
          iterationTimeoutMs,
        )
      );
      const retryResponse = await Promise.race([
        aiProvider.generateCode({ system: stage2SystemPrompt, user: improvementPrompt, extendedThinking: useET }),
        timeoutPromise,
      ]);
      const retryParsed = parseGeneratedCode(retryResponse.content);

      if (retryParsed.html) {
        const retryQuality = evaluateQuality(retryParsed.html, retryParsed.css, retryParsed.js);
        let retryQcReport: QcReport | null = null;

        if (isQcEnabled()) {
          try {
            const assembled = safeAssembleHtml(retryParsed);
            if (assembled) retryQcReport = await runFastQc(assembled);
          } catch {
            // QC 실패해도 코드 레벨 비교 진행
          }
        }

        const codeImproved =
          retryQuality.structuralScore > bestQuality.structuralScore ||
          retryQuality.mobileScore > bestQuality.mobileScore;
        const qcImproved =
          retryQcReport && bestQcReport
            ? retryQcReport.overallScore > bestQcReport.overallScore
            : false;

        if (codeImproved || qcImproved) {
          bestParsed = retryParsed;
          bestQuality = retryQuality;
          if (retryQcReport) bestQcReport = retryQcReport;
          qualityLoopUsed = true;
        }
      }
    } catch (retryErr) {
      logger.warn('Quality improvement retry failed', { projectId, retryErr });
    }
  }

  return { parsed: bestParsed, quality: bestQuality, qcReport: bestQcReport, qualityLoopUsed };
}
