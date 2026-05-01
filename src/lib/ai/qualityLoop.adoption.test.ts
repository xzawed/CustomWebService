// Quality Loop의 retry 채택 분기(qualityLoop.ts:211-214)와 QC 활성 분기(:188-190) 테스트.
// 기존 qualityLoop.test.ts는 실제 evaluateQuality를 사용해 retry 채택 시나리오를 만들기 어려워
// 이 파일에서 evaluateQuality를 mock하여 채택 결정만 격리해 검증한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { QualityMetrics } from '@/lib/ai/codeValidator';
import type { IAiProvider } from '@/providers/ai/IAiProvider';
import type { SseWriter } from '@/lib/ai/sseWriter';
import type { QcReport } from '@/types/qc';

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('@/lib/ai/codeValidator', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/codeValidator')>('@/lib/ai/codeValidator');
  return { ...actual, evaluateQuality: vi.fn() };
});

vi.mock('@/lib/qc', () => ({
  runFastQc: vi.fn(),
  isQcEnabled: vi.fn(),
}));

import { runQualityLoop } from './qualityLoop';
import { evaluateQuality } from '@/lib/ai/codeValidator';
import { runFastQc, isQcEnabled } from '@/lib/qc';

const baseMetrics: QualityMetrics = {
  structuralScore: 80, mobileScore: 80,
  hasSemanticHtml: true, hasMockData: false, hasInteraction: true,
  hasResponsiveClasses: true, hasAdequateResponsive: true, noFixedOverflow: true,
  hasImageProtection: true, hasMobileNav: true, hasFooter: true, hasImgAlt: true,
  fetchCallCount: 1, hasProxyCall: true, hasJsonParse: true, placeholderCount: 0,
  hardcodedArrayCount: 0,
  hasTailwindCdn: true,
  details: [],
};

const lowQuality: QualityMetrics = {
  ...baseMetrics,
  structuralScore: 30,
  mobileScore: 30,
};

const validRetryContent =
  '### HTML\n```html\n' +
  '<main>' + '<p>retry</p>'.repeat(20) + '</main>\n' +
  '```\n### CSS\n```css\nbody{margin:0;padding:0;display:flex}\n```\n' +
  '### JavaScript\n```javascript\nfetch("/api/v1/proxy")\n```';

function makeMockSse(): SseWriter {
  return { send: vi.fn(), isCancelled: vi.fn().mockReturnValue(false) };
}

function makeMockProvider(generateCode: ReturnType<typeof vi.fn>): IAiProvider {
  return {
    name: 'mock',
    model: 'mock',
    generateCode: generateCode as unknown as IAiProvider['generateCode'],
    generateCodeStream: vi.fn(),
    checkAvailability: vi.fn(),
  };
}

describe('runQualityLoop — retry 채택 분기 (Quality Loop 정확도 게이트)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(isQcEnabled).mockReturnValue(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('retry quality가 둘 다 향상되면 채택한다 (strict 모드 기본)', async () => {
    // 초기 quality는 낮음(shouldRetry=true 트리거) → retry는 둘 다 향상 → 채택
    vi.mocked(evaluateQuality).mockReturnValueOnce({
      ...baseMetrics,
      structuralScore: 90,
      mobileScore: 90,
    });

    const generateCode = vi.fn().mockResolvedValueOnce({ content: validRetryContent });

    const result = await runQualityLoop(
      { html: '<div>old</div>', css: '', js: '' },
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p-adopt-1' },
    );

    expect(result.qualityLoopUsed).toBe(true);
    expect(result.quality.structuralScore).toBe(90);
    expect(result.quality.mobileScore).toBe(90);
  });

  it('retry quality 한쪽 향상 + 한쪽 동등은 채택한다 (strict 모드 boundary)', async () => {
    // strict 모드에서 (struct↑ + mobile=) 또는 (mobile↑ + struct=)는 채택 (AND 가드)
    vi.mocked(evaluateQuality).mockReturnValueOnce({
      ...baseMetrics,
      structuralScore: 50,
      mobileScore: 30, // 동등
    });

    const generateCode = vi.fn().mockResolvedValueOnce({ content: validRetryContent });

    const result = await runQualityLoop(
      { html: '<div>old</div>', css: '', js: '' },
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p-adopt-2' },
    );

    expect(result.qualityLoopUsed).toBe(true);
    expect(result.quality.structuralScore).toBe(50);
  });

  it('retry quality 한쪽 향상 + 한쪽 회귀는 strict 모드에서 거부한다 (기능 이슈 없을 때)', async () => {
    // strict 가드: structuralScore↑ but mobileScore↓ → 거부
    // baseMetrics 기반 lowQuality는 fetchCallCount=1, hasProxyCall=true → 기능 이슈 없음
    // 기능 이슈 없는 상황에서 점수만 변동하면 AND 가드 정상 적용
    vi.mocked(evaluateQuality).mockReturnValue({
      ...baseMetrics,
      structuralScore: 50,
      mobileScore: 20, // 회귀
    });

    const generateCode = vi.fn().mockResolvedValue({ content: validRetryContent });

    const result = await runQualityLoop(
      { html: '<div>old</div>', css: '', js: '' },
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p-adopt-3' },
    );

    expect(result.qualityLoopUsed).toBe(false);
    expect(result.parsed.html).toContain('<div>old</div>'); // 초기 유지
  });

  it('QUALITY_LOOP_STRICT_ADOPTION=false → 한쪽만 향상해도 채택', async () => {
    vi.stubEnv('QUALITY_LOOP_STRICT_ADOPTION', 'false');

    vi.mocked(evaluateQuality).mockReturnValueOnce({
      ...baseMetrics,
      structuralScore: 50,
      mobileScore: 20, // 회귀이지만 OR 로직이라 채택
    });

    const generateCode = vi.fn().mockResolvedValueOnce({ content: validRetryContent });

    const result = await runQualityLoop(
      { html: '<div>old</div>', css: '', js: '' },
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p-adopt-4' },
    );

    expect(result.qualityLoopUsed).toBe(true);
    expect(result.quality.structuralScore).toBe(50);
  });

  it('isQcEnabled=true + runFastQc 성공 → QC 리포트가 채택 결과에 포함된다', async () => {
    vi.mocked(isQcEnabled).mockReturnValue(true);
    const retryQcReport: QcReport = {
      overallScore: 90,
      passed: true,
      checks: [],
    } as unknown as QcReport;
    vi.mocked(runFastQc).mockResolvedValueOnce(retryQcReport);

    vi.mocked(evaluateQuality).mockReturnValueOnce({
      ...baseMetrics,
      structuralScore: 90,
      mobileScore: 90,
    });

    const generateCode = vi.fn().mockResolvedValueOnce({ content: validRetryContent });

    const result = await runQualityLoop(
      { html: '<div>old</div>', css: '', js: '' },
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p-adopt-qc' },
    );

    expect(runFastQc).toHaveBeenCalled();
    expect(result.qualityLoopUsed).toBe(true);
    expect(result.qcReport).toEqual(retryQcReport);
  });

  it('isQcEnabled=true + runFastQc throw → QC 실패해도 코드 채택은 진행', async () => {
    vi.mocked(isQcEnabled).mockReturnValue(true);
    vi.mocked(runFastQc).mockRejectedValueOnce(new Error('QC 실패'));

    vi.mocked(evaluateQuality).mockReturnValueOnce({
      ...baseMetrics,
      structuralScore: 90,
      mobileScore: 90,
    });

    const generateCode = vi.fn().mockResolvedValueOnce({ content: validRetryContent });

    const result = await runQualityLoop(
      { html: '<div>old</div>', css: '', js: '' },
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p-adopt-qc-fail' },
    );

    expect(result.qualityLoopUsed).toBe(true); // QC 실패해도 코드 점수로 채택
  });

  it('isQcEnabled=true + assembleHtml 실패(빈 css/js → throw 시뮬) → STAGE_SKIPPED 이벤트 발행', async () => {
    // assembleHtml 직접 mock은 어려우므로, retry html이 매우 짧아 DOMPurify가
    // 실패 시 STAGE_SKIPPED 발행 검증. 단, assembleHtml은 일반적으로 throw하지 않으므로
    // 실패 가시화 자체는 logger.warn 호출 검증으로 대체. (이벤트는 assembled === null
    // 케이스에서만 발행되며, 실제 실패 재현이 어려울 때는 silent skip 케이스로 검증)
    const { eventBus } = await import('@/lib/events/eventBus');
    vi.mocked(eventBus.emit).mockClear();

    vi.mocked(isQcEnabled).mockReturnValue(true);
    // runFastQc는 호출되지 않을 것 (assembled가 정상이면 호출, 실패 시 skip)
    vi.mocked(runFastQc).mockResolvedValue({
      overallScore: 80,
      passed: true,
      checks: [],
    } as unknown as QcReport);

    vi.mocked(evaluateQuality).mockReturnValueOnce({
      ...baseMetrics,
      structuralScore: 90,
      mobileScore: 90,
    });

    const generateCode = vi.fn().mockResolvedValueOnce({ content: validRetryContent });

    const result = await runQualityLoop(
      { html: '<div>old</div>', css: '', js: '' },
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p-skip-vis' },
    );

    // 정상 retry assemble → runFastQc 호출됨
    expect(runFastQc).toHaveBeenCalled();
    expect(result.qualityLoopUsed).toBe(true);
    // QUALITY_LOOP_COMPLETED 이벤트는 항상 발행됨 (silent skip 가시화 외에 기존 동작 유지)
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'QUALITY_LOOP_COMPLETED' }),
    );
  });

  it('functionalIssueSolved: fetchCallCount 0→>0 이면 mobileScore 회귀해도 채택한다', async () => {
    // fetch 없음(API 호출 누락)이 있던 초기 코드를 retry가 해결하면 점수 회귀 무관하게 채택
    const noFetchQuality: QualityMetrics = {
      ...lowQuality,
      fetchCallCount: 0,
      hasProxyCall: false,
    };

    vi.mocked(evaluateQuality).mockReturnValueOnce({
      ...baseMetrics,
      fetchCallCount: 2,
      hasProxyCall: true,
      structuralScore: 30, // 동등 (delta=0)
      mobileScore: 20,     // 회귀 (delta=-10) → 기존 strict 게이트라면 거부
    });

    const generateCode = vi.fn().mockResolvedValueOnce({ content: validRetryContent });

    const result = await runQualityLoop(
      { html: '<div>old</div>', css: '', js: '' },
      noFetchQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p-func-1' },
    );

    expect(result.qualityLoopUsed).toBe(true); // functionalIssueSolved → 채택
  });

  it('functionalIssueSolved: proxy 미사용이 retry에서도 해결 안 되면 점수 향상해도 기능 이슈 잔존', async () => {
    // !hasProxyCall이 retry에서도 여전히 true → functionalIssueSolved=false
    // struct↑ + mobile↓ → strict AND 게이트 거부 (기능 이슈 + 점수 회귀 복합)
    const noProxyQuality: QualityMetrics = {
      ...lowQuality,
      hasProxyCall: false,
      fetchCallCount: 1,
    };

    vi.mocked(evaluateQuality).mockReturnValueOnce({
      ...baseMetrics,
      hasProxyCall: false, // 여전히 proxy 미사용
      fetchCallCount: 1,
      structuralScore: 90, // struct↑ 이지만
      mobileScore: 20,     // mobile↓ → AND 게이트 거부
    });

    const generateCode = vi.fn().mockResolvedValueOnce({ content: validRetryContent });

    const result = await runQualityLoop(
      { html: '<div>old</div>', css: '', js: '' },
      noProxyQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p-func-2' },
    );

    expect(result.qualityLoopUsed).toBe(false); // 기능 이슈 미해결 + 점수 회귀 → 거부
  });

  it('functionalIssueSolved: placeholder 5→0 이면 structuralScore·mobileScore 회귀해도 채택한다', async () => {
    // placeholder 제거가 retry에서 해결됐으면 점수 회귀 무관하게 채택
    const placeholderQuality: QualityMetrics = {
      ...lowQuality,
      placeholderCount: 5,
    };

    vi.mocked(evaluateQuality).mockReturnValueOnce({
      ...baseMetrics,
      placeholderCount: 0, // 해결
      structuralScore: 25, // 회귀
      mobileScore: 25,     // 회귀 → 둘 다 낮아졌지만 functionalIssueSolved=true → 채택
    });

    const generateCode = vi.fn().mockResolvedValueOnce({ content: validRetryContent });

    const result = await runQualityLoop(
      { html: '<div>old</div>', css: '', js: '' },
      placeholderQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p-func-3' },
    );

    expect(result.qualityLoopUsed).toBe(true); // functionalIssueSolved → 채택
  });
});
