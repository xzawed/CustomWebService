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

/**
 * Returns true when the generated code has functional issues that require a retry.
 * - fetchCallCount === 0: no API call at all — must fetch real data
 * - placeholderCount > 0: template placeholders leaked into output (홍길동, 준비 중, etc.)
 * - !hasProxyCall && fetchCallCount > 0: direct external fetch bypasses /api/v1/proxy → CORS failure at runtime
 * - hardcodedArrayCount > 0: mock data arrays present instead of real API calls
 */
export function hasFunctionalIssue(metrics: QualityMetrics): boolean {
  return (
    metrics.fetchCallCount === 0 ||
    metrics.placeholderCount > 0 ||
    (!metrics.hasProxyCall && metrics.fetchCallCount > 0) ||
    metrics.hardcodedArrayCount > 0
  );
}

/** 재시도를 유발하는 렌더링 QC 체크 이름(실패 시 retry). */
const BLOCKING_QC_CHECKS = ['consoleErrors', 'horizontalScroll', 'footerVisible', 'noLayoutOverlap'];

/** 차단 대상 렌더링 QC 체크 중 하나라도 실패했는지. */
function hasBlockingQcFailure(qcReport: QcReport): boolean {
  return qcReport.checks.some((c) => BLOCKING_QC_CHECKS.includes(c.name) && !c.passed);
}

export function shouldRetryGeneration(
  metrics: QualityMetrics,
  qcReport?: QcReport | null
): boolean {
  if (metrics.structuralScore < QC_THRESHOLDS.QUALITY) return true;
  if (metrics.mobileScore < QC_THRESHOLDS.MOBILE) return true;
  if (qcReport && hasBlockingQcFailure(qcReport)) return true;
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

export function resolveMaxIterations(): number {
  const v = Number.parseInt(process.env.QUALITY_LOOP_MAX_ITERATIONS ?? '', 10);
  if (Number.isNaN(v)) return 2;
  if (v === 0) return 0;
  return Math.min(Math.max(1, v), 3);
}

export function buildProgressSchedule(maxIterations: number): number[] {
  const step = maxIterations > 1 ? Math.floor(4 / (maxIterations - 1)) : 4;
  return Array.from({ length: maxIterations }, (_, i) =>
    i === maxIterations - 1 ? 97 : 93 + i * step,
  );
}

export function shouldAdoptRetry(
  bestQuality: QualityMetrics,
  retryQuality: QualityMetrics,
  bestQcReport: QcReport | null,
  retryQcReport: QcReport | null,
): boolean {
  const functionalIssueSolved = hasFunctionalIssue(bestQuality) && !hasFunctionalIssue(retryQuality);
  const strictAdoption = process.env.QUALITY_LOOP_STRICT_ADOPTION !== 'false';
  const structDelta = retryQuality.structuralScore - bestQuality.structuralScore;
  const mobileDelta = retryQuality.mobileScore - bestQuality.mobileScore;
  const codeImproved =
    functionalIssueSolved ||
    (strictAdoption
      ? (structDelta > 0 && mobileDelta >= 0) || (mobileDelta > 0 && structDelta >= 0)
      : structDelta > 0 || mobileDelta > 0);
  const qcImproved =
    retryQcReport && bestQcReport
      ? retryQcReport.overallScore > bestQcReport.overallScore
      : false;
  return codeImproved || qcImproved;
}

async function runQcForRetry(
  parsed: { html: string; css: string; js: string },
  projectId: string,
): Promise<QcReport | null> {
  if (!isQcEnabled()) return null;
  try {
    const assembled = safeAssembleHtml(parsed, { projectId, phase: 'retry' });
    if (!assembled) {
      eventBus.emit({
        type: 'STAGE_SKIPPED',
        payload: { projectId, stage: 'stage3', reason: 'assembleHtml failed in retry — QC skipped, falling back to code-level scoring' },
      });
      return null;
    }
    return await runFastQc(assembled);
  } catch (qcErr) {
    logger.warn('runFastQc threw in quality loop retry — falling back to code-level scoring', {
      projectId,
      error: qcErr instanceof Error ? qcErr.message : String(qcErr),
    });
    return null;
  }
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

interface BestState {
  parsed: { html: string; css: string; js: string };
  quality: QualityMetrics;
  qcReport: QcReport | null;
  qualityLoopUsed: boolean;
}

/**
 * AutoFix 단계를 실행해 best 상태를 업데이트한다.
 * 반환값: 'resolved' — AutoFix만으로 품질 기준 통과 (LLM 불필요)
 *          'partial'  — 일부 수정됐지만 LLM 재시도 필요
 *          'none'     — AutoFix 적용 없음
 */
function applyAutoFixStep(
  state: BestState,
  projectId: string,
  attempt: number,
): 'resolved' | 'partial' | 'none' {
  const autoFixResult = applyAutoFix(state.parsed);
  if (autoFixResult.fixesApplied.length === 0) return 'none';

  const autoFixedQuality = evaluateQuality(autoFixResult.html, autoFixResult.css, autoFixResult.js);
  state.parsed = { html: autoFixResult.html, css: autoFixResult.css, js: autoFixResult.js };
  state.quality = autoFixedQuality;

  if (!shouldRetryGeneration(autoFixedQuality, state.qcReport)) {
    state.qualityLoopUsed = true;
    logger.info('AutoFix resolved quality issues — LLM retry skipped', {
      projectId, attempt: attempt + 1, fixes: autoFixResult.fixesApplied,
    });
    return 'resolved';
  }

  // state.qcReport intentionally not re-run: autofix only changes text patterns
  // (URLs, placeholder strings) — DOM structure is unchanged, QC delta meaningless.
  logger.info('AutoFix partial fix — LLM retry still needed', {
    projectId, attempt: attempt + 1, fixes: autoFixResult.fixesApplied,
  });
  return 'partial';
}

export function resolveIterationTimeoutMs(useET: boolean): number {
  const timeoutEnvKey = useET ? 'QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS' : 'QUALITY_LOOP_ITERATION_TIMEOUT_MS';
  const defaultTimeoutMs = useET ? 200_000 : 120_000;
  const v = Number.parseInt(process.env[timeoutEnvKey] ?? '', 10);
  return Number.isNaN(v) || v <= 0 ? defaultTimeoutMs : v;
}

/**
 * LLM 재시도 한 회를 실행해 best 상태를 업데이트한다.
 * AI 호출 실패·빈 응답·채택 실패는 모두 조용히 처리한다.
 */
async function runLlmRetryIteration(
  state: BestState,
  options: {
    systemPrompt: string;
    userFeedback: string | undefined;
    aiProvider: IAiProvider;
    iterationTimeoutMs: number;
    useET: boolean;
    projectId: string;
    attempt: number;
  },
): Promise<void> {
  const { systemPrompt, userFeedback, aiProvider, iterationTimeoutMs, useET, projectId, attempt } = options;
  try {
    const improvementPrompt = buildQualityImprovementPrompt(state.parsed, state.quality, state.qcReport, userFeedback);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Quality loop iteration timed out after ${iterationTimeoutMs}ms`)),
        iterationTimeoutMs,
      );
    });
    // race 종료 후 타이머를 정리한다. 성공 시에도 타이머가 만료(최대 200초)까지 살아남던 누수 차단.
    const retryResponse = await Promise.race([
      aiProvider.generateCode({ system: systemPrompt, user: improvementPrompt, extendedThinking: useET }),
      timeoutPromise,
    ]).finally(() => clearTimeout(timeoutId));
    const retryParsed = parseGeneratedCode(retryResponse.content);

    if (!retryParsed.html) {
      logger.warn('Quality loop retry returned empty html — skipping adoption', {
        projectId,
        attempt: attempt + 1,
        contentLength: retryResponse.content?.length ?? 0,
      });
      return;
    }

    const retryQuality = evaluateQuality(retryParsed.html, retryParsed.css, retryParsed.js);
    const retryQcReport = await runQcForRetry(retryParsed, projectId);

    if (shouldAdoptRetry(state.quality, retryQuality, state.qcReport, retryQcReport)) {
      state.parsed = retryParsed;
      state.quality = retryQuality;
      // 채택된 코드(retryParsed)와 QC 리포트를 항상 동기화한다. retryQcReport가 null이면
      // (retry QC 실패) qcReport도 null로 갱신 — 이전 코드 기준의 스테일 점수를 새 코드에
      // 잘못 매핑하지 않도록 한다. downstream은 qcReport: QcReport | null을 이미 처리한다.
      state.qcReport = retryQcReport;
      state.qualityLoopUsed = true;
    }
  } catch (retryErr) {
    logger.warn('Quality improvement retry failed', { projectId, retryErr });
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
  /** Date.now() at pipeline entry — used for Railway 300s total budget guard */
  pipelineStartMs?: number;
}

export function resolvePipelineBudgetMs(): number {
  const v = Number.parseInt(process.env.PIPELINE_MAX_DURATION_MS ?? '', 10);
  return Number.isNaN(v) || v <= 0 ? 290_000 : v;
}

/** 품질 기준 미달 시 최대 N회 재생성 시도, 최선 버전 반환 */
export async function runQualityLoop(
  initialParsed: { html: string; css: string; js: string },
  initialQuality: ReturnType<typeof evaluateQuality>,
  initialQcReport: QcReport | null,
  options: QualityLoopRunOptions,
): Promise<QualityLoopResult> {
  const { stage2SystemPrompt, stage2FunctionSystemPrompt, aiProvider, sse, useET, projectId, userFeedback, pipelineStartMs } = options;
  const state: BestState = {
    parsed: initialParsed,
    quality: initialQuality,
    qcReport: initialQcReport,
    qualityLoopUsed: false,
  };
  let iterationsRun = 0;

  const maxIterations = resolveMaxIterations();
  const qualityLoopProgress = buildProgressSchedule(maxIterations);
  const iterationTimeoutMs = resolveIterationTimeoutMs(useET);
  const pipelineBudgetMs = resolvePipelineBudgetMs();

  for (let attempt = 0; attempt < maxIterations; attempt++) {
    if (!shouldRetryGeneration(state.quality, state.qcReport)) break;

    // AutoFix: deterministic rules before LLM retry — saves tokens when fixable
    const autoFixOutcome = applyAutoFixStep(state, projectId, attempt);
    if (autoFixOutcome === 'resolved') break;

    // Railway 300s 총 예산 가드 — elapsed + 이번 반복 예상 시간이 예산 초과 시 스킵
    if (pipelineStartMs !== undefined) {
      const elapsed = Date.now() - pipelineStartMs;
      if (elapsed + iterationTimeoutMs > pipelineBudgetMs) {
        logger.warn('Quality loop iteration skipped — insufficient pipeline time budget', {
          projectId, elapsed, iterationTimeoutMs, pipelineBudgetMs,
        });
        break;
      }
    }

    iterationsRun++;

    logger.info('Quality below threshold, attempting improvement', {
      projectId,
      score: state.quality.structuralScore,
      attempt: attempt + 1,
    });

    const progress = qualityLoopProgress[attempt] ?? 97;
    const message = `품질 개선 중... (${attempt + 1}/${maxIterations}회)`;
    sse.send('progress', { step: 'quality_improvement', progress, message });
    generationTracker.updateProgress(projectId, progress, 'quality_improvement', message);

    // Functional issues (no API call, proxy bypass, mock data, placeholders) use the
    // function-fix prompt; design/layout issues use the design polish prompt.
    const systemPrompt = hasFunctionalIssue(state.quality) ? stage2FunctionSystemPrompt : stage2SystemPrompt;

    await runLlmRetryIteration(state, { systemPrompt, userFeedback, aiProvider, iterationTimeoutMs, useET, projectId, attempt });
  }

  eventBus.emit({
    type: 'QUALITY_LOOP_COMPLETED',
    payload: {
      projectId,
      iterations: iterationsRun,
      improved: state.qualityLoopUsed,
      finalStructuralScore: state.quality.structuralScore,
      finalMobileScore: state.quality.mobileScore,
    },
  });

  return { parsed: state.parsed, quality: state.quality, qcReport: state.qcReport, qualityLoopUsed: state.qualityLoopUsed };
}
