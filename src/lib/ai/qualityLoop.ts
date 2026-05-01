import { evaluateQuality } from '@/lib/ai/codeValidator';
import type { QualityMetrics } from '@/lib/ai/codeValidator';
import type { QcReport } from '@/types/qc';
import { QC_THRESHOLDS } from '@/lib/config/qc';
import { runFastQc, isQcEnabled } from '@/lib/qc';
import { parseGeneratedCode } from '@/lib/ai/codeParser';
import { assembleHtml } from '@/lib/ai/codeParser';
import { generationTracker } from '@/lib/ai/generationTracker';
import { logger } from '@/lib/utils/logger';
import { eventBus } from '@/lib/events/eventBus';
import { getPlaceholderBlocklistText } from '@/lib/ai/placeholderPatterns';
import { applyAutoFix } from '@/lib/ai/autoFix';
import type { IAiProvider } from '@/providers/ai/IAiProvider';
import type { SseWriter } from '@/lib/ai/sseWriter';

export function hasFunctionalIssue(metrics: QualityMetrics): boolean {
  return (
    metrics.fetchCallCount === 0 ||
    metrics.placeholderCount > 0 ||
    (!metrics.hasProxyCall && metrics.fetchCallCount > 0) ||
    metrics.hardcodedArrayCount > 0
  );
}

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
  if (hasFunctionalIssue(metrics)) return true;
  return false;
}

export function buildQualityImprovementPrompt(
  previousCode: { html: string; css: string; js: string },
  metrics: QualityMetrics,
  qcReport?: QcReport | null,
  userFeedback?: string,
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

  const feedbackSection = userFeedback && userFeedback.trim().length > 0
    ? `\n\n## 사용자 요청 (재생성 시 입력) — 반드시 반영\n${userFeedback.trim()}\n`
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
${qcIssues ? `\n브라우저 렌더링 검증에서 발견된 추가 문제:\n${qcIssues}\n` : ''}${feedbackSection}
수정 규칙:
- 기존 기능과 디자인은 최대한 유지하면서 위 문제만 정확히 수정
- 시맨틱 HTML 태그(<main>, <nav>, <footer>, <article>) 사용
- 모든 <img>에 한국어 alt 속성 추가
- fetch() 호출이 없다면 반드시 추가하라
- 모든 fetch() 호출은 반드시 /api/v1/proxy 경로를 통해야 한다 — 외부 URL 직접 호출은 CORS 오류 발생
- 하드코딩된 배열 데이터(const items = [...])는 제거하고 /api/v1/proxy를 통한 실제 API 호출로 교체
- placeholder 문자열을 제거하라: ${getPlaceholderBlocklistText()}
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

/**
 * assembleHtml의 안전 래퍼. throw 대신 null 반환으로 호출자가 분기할 수 있게 함.
 * null 반환은 호출자가 QC 단계를 silent skip하는 통로가 될 수 있으므로 (정확도 회귀
 * 마스킹 위험), 실패 시 로그를 남겨 운영 가시성을 확보한다.
 */
function safeAssembleHtml(
  code: { html: string; css: string; js: string },
  context: { projectId: string; phase: 'retry' | 'initial' },
): string | null {
  try {
    return assembleHtml(code);
  } catch (err) {
    logger.warn('assembleHtml failed — QC를 건너뛰고 코드 점수만으로 판정', {
      projectId: context.projectId,
      phase: context.phase,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export interface QualityLoopResult {
  parsed: { html: string; css: string; js: string };
  quality: ReturnType<typeof evaluateQuality>;
  qcReport: QcReport | null;
  qualityLoopUsed: boolean;
}

export interface QualityLoopRunOptions {
  stage2SystemPrompt: string;
  stage2FunctionSystemPrompt: string;
  aiProvider: IAiProvider;
  sse: SseWriter;
  useET: boolean;
  projectId: string;
  userFeedback?: string;
}

/** 품질 기준 미달 시 최대 N회 재생성 시도, 최선 버전 반환 */
export async function runQualityLoop(
  initialParsed: { html: string; css: string; js: string },
  initialQuality: ReturnType<typeof evaluateQuality>,
  initialQcReport: QcReport | null,
  options: QualityLoopRunOptions,
): Promise<QualityLoopResult> {
  const { stage2SystemPrompt, stage2FunctionSystemPrompt, aiProvider, sse, useET, projectId, userFeedback } = options;
  let bestParsed = initialParsed;
  let bestQuality = initialQuality;
  let bestQcReport = initialQcReport;
  let qualityLoopUsed = false;
  let iterationsRun = 0;

  const _maxIter = Number.parseInt(process.env.QUALITY_LOOP_MAX_ITERATIONS ?? '', 10);
  const maxIterations = Number.isNaN(_maxIter) || _maxIter <= 0 ? 2 : Math.min(_maxIter, 3);
  // progress 구간: 93부터 97까지 maxIterations 등분 (예: 2회→[93,97], 3회→[93,95,97])
  const progressStep = maxIterations > 1 ? Math.floor(4 / (maxIterations - 1)) : 4;
  const qualityLoopProgress = Array.from({ length: maxIterations }, (_, i) =>
    i === maxIterations - 1 ? 97 : 93 + i * progressStep,
  );

  for (let attempt = 0; attempt < maxIterations; attempt++) {
    if (!shouldRetryGeneration(bestQuality, bestQcReport)) break;

    // AutoFix: deterministic rules before LLM retry — saves tokens when fixable
    const autoFixResult = applyAutoFix(bestParsed);
    if (autoFixResult.fixesApplied.length > 0) {
      const autoFixedQuality = evaluateQuality(
        autoFixResult.html, autoFixResult.css, autoFixResult.js,
      );
      if (!shouldRetryGeneration(autoFixedQuality, bestQcReport)) {
        bestParsed = { html: autoFixResult.html, css: autoFixResult.css, js: autoFixResult.js };
        bestQuality = autoFixedQuality;
        qualityLoopUsed = true;
        // bestQcReport intentionally not re-run: autofix rules only change text patterns
        // (URLs, comments, placeholder strings) — DOM structure is unchanged.
        logger.info('AutoFix resolved quality issues — LLM retry skipped', {
          projectId, attempt: attempt + 1, fixes: autoFixResult.fixesApplied,
        });
        break;
      }
      // Partial fix: apply and use as base for LLM retry
      bestParsed = { html: autoFixResult.html, css: autoFixResult.css, js: autoFixResult.js };
      bestQuality = autoFixedQuality;
      logger.info('AutoFix partial fix — LLM retry still needed', {
        projectId, attempt: attempt + 1, fixes: autoFixResult.fixesApplied,
      });
    }

    iterationsRun++;

    logger.info('Quality below threshold, attempting improvement', {
      projectId,
      score: bestQuality.structuralScore,
      attempt: attempt + 1,
    });

    const progress = qualityLoopProgress[attempt] ?? 97;
    const message = `품질 개선 중... (${attempt + 1}/${maxIterations}회)`;
    sse.send('progress', { step: 'quality_improvement', progress, message });
    generationTracker.updateProgress(projectId, progress, 'quality_improvement', message);

    // Functional issues (no API call, proxy bypass, mock data, placeholders) use the
    // function-fix prompt; design/layout issues use the design polish prompt.
    const isFunctionalIssue = hasFunctionalIssue(bestQuality);
    const iterationSystemPrompt = isFunctionalIssue ? stage2FunctionSystemPrompt : stage2SystemPrompt;

    try {
      const improvementPrompt = buildQualityImprovementPrompt(bestParsed, bestQuality, bestQcReport, userFeedback);
      const _loopVal = Number.parseInt(process.env.QUALITY_LOOP_ITERATION_TIMEOUT_MS ?? '', 10);
      const iterationTimeoutMs = Number.isNaN(_loopVal) || _loopVal <= 0 ? 120_000 : _loopVal;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Quality loop iteration timed out after ${iterationTimeoutMs}ms`)),
          iterationTimeoutMs,
        )
      );
      const retryResponse = await Promise.race([
        aiProvider.generateCode({ system: iterationSystemPrompt, user: improvementPrompt, extendedThinking: useET }),
        timeoutPromise,
      ]);
      const retryParsed = parseGeneratedCode(retryResponse.content);

      if (!retryParsed.html) {
        // AI가 비어있거나 파싱 불가능한 응답을 반환한 경우. 다음 시도로 넘어가기 전에
        // 운영 가시성 확보를 위해 로그 — 빈 응답 빈도가 높으면 모델/프롬프트 점검 필요.
        logger.warn('Quality loop retry returned empty html — skipping adoption', {
          projectId,
          attempt: attempt + 1,
          contentLength: retryResponse.content?.length ?? 0,
        });
      }

      if (retryParsed.html) {
        const retryQuality = evaluateQuality(retryParsed.html, retryParsed.css, retryParsed.js);
        let retryQcReport: QcReport | null = null;

        if (isQcEnabled()) {
          try {
            const assembled = safeAssembleHtml(retryParsed, { projectId, phase: 'retry' });
            if (assembled) {
              retryQcReport = await runFastQc(assembled);
            } else {
              // assembled === null: safeAssembleHtml이 이미 logger.warn으로 기록함.
              // 추가로 STAGE_SKIPPED 이벤트를 발행해 시계열 분석 가능하게.
              eventBus.emit({
                type: 'STAGE_SKIPPED',
                payload: {
                  projectId,
                  stage: 'stage3',
                  reason: 'assembleHtml failed in retry — QC skipped, falling back to code-level scoring',
                },
              });
            }
          } catch (qcErr) {
            // QC 실패해도 코드 레벨 비교 진행 — 단, 운영 가시성을 위해 로그
            logger.warn('runFastQc threw in quality loop retry — falling back to code-level scoring', {
              projectId,
              error: qcErr instanceof Error ? qcErr.message : String(qcErr),
            });
          }
        }

        // 채택 기준: 한쪽 점수만 올라도 채택하던 기존 OR 로직은 시소 진동(한쪽 향상 + 다른 쪽 회귀)을
        // 허용해 누적 정확도를 떨어뜨릴 수 있다. AND 가드는 한 점수 향상 + 다른 점수 동등 이상일 때만 채택.
        // QUALITY_LOOP_STRICT_ADOPTION=false (기본 true)로 신구 로직 토글 가능 — 운영 데이터 비교용.
        const strictAdoption = process.env.QUALITY_LOOP_STRICT_ADOPTION !== 'false';
        const structDelta = retryQuality.structuralScore - bestQuality.structuralScore;
        const mobileDelta = retryQuality.mobileScore - bestQuality.mobileScore;

        // 기능 이슈(proxy 미사용, fetch 없음, placeholder, hardcoded array)가 retry 코드에서
        // 해결됐다면 점수 등락 무관하게 채택 — 기능 정확도가 점수보다 우선
        const prevHadFunctionalIssue = hasFunctionalIssue(bestQuality);
        const retryHasFunctionalIssue = hasFunctionalIssue(retryQuality);
        const functionalIssueSolved = prevHadFunctionalIssue && !retryHasFunctionalIssue;

        const codeImproved =
          functionalIssueSolved ||
          (strictAdoption
            ? (structDelta > 0 && mobileDelta >= 0) || (mobileDelta > 0 && structDelta >= 0)
            : structDelta > 0 || mobileDelta > 0);
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

  eventBus.emit({
    type: 'QUALITY_LOOP_COMPLETED',
    payload: {
      projectId,
      iterations: iterationsRun,
      improved: qualityLoopUsed,
      finalStructuralScore: bestQuality.structuralScore,
      finalMobileScore: bestQuality.mobileScore,
    },
  });

  return { parsed: bestParsed, quality: bestQuality, qcReport: bestQcReport, qualityLoopUsed };
}
