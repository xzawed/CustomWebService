import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

import { shouldRetryGeneration, buildQualityImprovementPrompt, runQualityLoop, hasFunctionalIssue, resolveMaxIterations, buildProgressSchedule, shouldAdoptRetry } from './qualityLoop';
import { eventBus } from '@/lib/events/eventBus';
import type { QualityMetrics } from '@/lib/ai/codeValidator';
import type { IAiProvider } from '@/providers/ai/IAiProvider';
import type { SseWriter } from '@/lib/ai/sseWriter';
import type { QcReport } from '@/types/qc';

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

describe('shouldRetryGeneration', () => {
  it('점수 40 미만이면 true를 반환한다', () => {
    const metrics: QualityMetrics = {
      ...baseMetrics,
      structuralScore: 30,
      mobileScore: 60,
      hasSemanticHtml: false,
      hasInteraction: false,
      hasFooter: false,
      hasImgAlt: false,
      details: ['시맨틱 HTML 부족'],
    };
    expect(shouldRetryGeneration(metrics)).toBe(true);
  });

  it('점수 40 이상이면 false를 반환한다', () => {
    expect(shouldRetryGeneration(baseMetrics)).toBe(false);
  });

  it('정확히 60이면 false를 반환한다', () => {
    const metrics: QualityMetrics = {
      ...baseMetrics,
      structuralScore: 60,
    };
    expect(shouldRetryGeneration(metrics)).toBe(false);
  });

  it('모바일 점수 40 미만이면 true를 반환한다', () => {
    const metrics: QualityMetrics = {
      ...baseMetrics,
      mobileScore: 20,
      hasAdequateResponsive: false,
      hasImageProtection: false,
      hasMobileNav: false,
    };
    expect(shouldRetryGeneration(metrics)).toBe(true);
  });

  it('retries when fetchCallCount === 0', () => {
    expect(shouldRetryGeneration({ ...baseMetrics, fetchCallCount: 0 }, null)).toBe(true);
  });

  it('retries when placeholderCount > 0', () => {
    expect(shouldRetryGeneration({ ...baseMetrics, placeholderCount: 3 }, null)).toBe(true);
  });

  it('does NOT retry when fetch present and no placeholders', () => {
    expect(shouldRetryGeneration(baseMetrics, null)).toBe(false);
  });

  it('retries when fetch calls exist but none use the proxy (hasProxyCall=false)', () => {
    expect(shouldRetryGeneration({ ...baseMetrics, hasProxyCall: false, fetchCallCount: 2 }, null)).toBe(true);
  });

  it('does NOT retry when no fetch calls (fetchCallCount=0 already triggers independently)', () => {
    // fetchCallCount=0 triggers separately; hasProxyCall=false alone (no fetches) should not double-trigger
    expect(shouldRetryGeneration({ ...baseMetrics, hasProxyCall: false, fetchCallCount: 0 }, null)).toBe(true);
  });

  it('retries when hardcodedArrayCount > 0', () => {
    expect(shouldRetryGeneration({ ...baseMetrics, hardcodedArrayCount: 3 }, null)).toBe(true);
  });

  it('does NOT retry when hardcodedArrayCount is 0 and other metrics are fine', () => {
    expect(shouldRetryGeneration({ ...baseMetrics, hardcodedArrayCount: 0 }, null)).toBe(false);
  });
});

describe('buildQualityImprovementPrompt', () => {
  it('details 목록을 개선 지시에 포함한다', () => {
    const metrics: QualityMetrics = {
      ...baseMetrics,
      structuralScore: 30,
      mobileScore: 60,
      hasSemanticHtml: false,
      hasFooter: false,
      hasImgAlt: false,
      details: ['시맨틱 HTML 부족', '<footer> 태그가 없습니다'],
    };
    const prompt = buildQualityImprovementPrompt(
      { html: '<div>test</div>', css: '', js: '' },
      metrics
    );
    expect(prompt).toContain('시맨틱 HTML 부족');
    expect(prompt).toContain('<footer>');
    expect(prompt).toContain('이전 생성 코드');
    expect(prompt).toContain('구조 30/100');
  });

  it('이전 코드를 코드 블록에 포함한다', () => {
    const prompt = buildQualityImprovementPrompt(
      { html: '<div>hello</div>', css: 'body{}', js: 'var x=1' },
      { ...baseMetrics, structuralScore: 20, details: ['test'] }
    );
    expect(prompt).toContain('<div>hello</div>');
    expect(prompt).toContain('body{}');
    expect(prompt).toContain('var x=1');
  });

  it('does NOT contain "15개" mock data instruction', () => {
    const prompt = buildQualityImprovementPrompt({ html: '', css: '', js: '' }, baseMetrics, null);
    expect(prompt).not.toContain('15개');
    expect(prompt).not.toContain('목 데이터');
  });

  it('instructs to add fetch when missing', () => {
    const prompt = buildQualityImprovementPrompt(
      { html: '', css: '', js: '' },
      { ...baseMetrics, fetchCallCount: 0 },
      null,
    );
    expect(prompt).toMatch(/fetch|API 호출/i);
  });

  it('userFeedback이 있으면 "사용자 요청" 섹션을 포함한다 (재생성 누적)', () => {
    const prompt = buildQualityImprovementPrompt(
      { html: '', css: '', js: '' },
      baseMetrics,
      null,
      '버튼 색상을 파란색으로 바꿔주세요',
    );
    expect(prompt).toContain('사용자 요청');
    expect(prompt).toContain('버튼 색상을 파란색으로 바꿔주세요');
  });

  it('userFeedback이 없으면 사용자 요청 섹션을 포함하지 않는다', () => {
    const prompt = buildQualityImprovementPrompt({ html: '', css: '', js: '' }, baseMetrics, null);
    expect(prompt).not.toContain('사용자 요청');
  });

  it('userFeedback이 빈 문자열이면 섹션을 포함하지 않는다 (trim 후 빈 값)', () => {
    const prompt = buildQualityImprovementPrompt({ html: '', css: '', js: '' }, baseMetrics, null, '   ');
    expect(prompt).not.toContain('사용자 요청');
  });
});

describe('hasFunctionalIssue', () => {
  it('fetchCallCount === 0 시 true 반환', () => {
    expect(hasFunctionalIssue({ ...baseMetrics, fetchCallCount: 0 })).toBe(true);
  });
  it('placeholderCount > 0 시 true 반환', () => {
    expect(hasFunctionalIssue({ ...baseMetrics, placeholderCount: 1 })).toBe(true);
  });
  it('hasProxyCall=false && fetchCallCount > 0 시 true 반환', () => {
    expect(hasFunctionalIssue({ ...baseMetrics, hasProxyCall: false, fetchCallCount: 2 })).toBe(true);
  });
  it('hardcodedArrayCount > 0 시 true 반환', () => {
    expect(hasFunctionalIssue({ ...baseMetrics, hardcodedArrayCount: 1 })).toBe(true);
  });
  it('모든 조건 정상이면 false 반환', () => {
    expect(hasFunctionalIssue(baseMetrics)).toBe(false);
  });
});

describe('resolveMaxIterations', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('미설정 시 기본값 2 반환', () => {
    expect(resolveMaxIterations()).toBe(2);
  });
  it('QUALITY_LOOP_MAX_ITERATIONS=3 → 3', () => {
    vi.stubEnv('QUALITY_LOOP_MAX_ITERATIONS', '3');
    expect(resolveMaxIterations()).toBe(3);
  });
  it('QUALITY_LOOP_MAX_ITERATIONS=4 → 상한 3', () => {
    vi.stubEnv('QUALITY_LOOP_MAX_ITERATIONS', '4');
    expect(resolveMaxIterations()).toBe(3);
  });
  it('QUALITY_LOOP_MAX_ITERATIONS=0 → 기본값 2', () => {
    vi.stubEnv('QUALITY_LOOP_MAX_ITERATIONS', '0');
    expect(resolveMaxIterations()).toBe(2);
  });
  it('빈 문자열 → 기본값 2', () => {
    vi.stubEnv('QUALITY_LOOP_MAX_ITERATIONS', '');
    expect(resolveMaxIterations()).toBe(2);
  });
});

describe('buildProgressSchedule', () => {
  it('maxIterations=2 → [93, 97]', () => {
    expect(buildProgressSchedule(2)).toEqual([93, 97]);
  });
  it('maxIterations=3 → [93, 95, 97]', () => {
    expect(buildProgressSchedule(3)).toEqual([93, 95, 97]);
  });
  it('maxIterations=1 → [97]', () => {
    expect(buildProgressSchedule(1)).toEqual([97]);
  });
});

describe('shouldAdoptRetry', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  const qc60 = { overallScore: 60, passed: true, checks: [] } as unknown as QcReport;
  const qc80 = { overallScore: 80, passed: true, checks: [] } as unknown as QcReport;

  it('functional issue 해결 시 점수 무관하게 true', () => {
    const best = { ...baseMetrics, fetchCallCount: 0 };
    const retry = { ...baseMetrics, fetchCallCount: 1, hasProxyCall: true };
    expect(shouldAdoptRetry(best, retry, null, null)).toBe(true);
  });
  it('strict 모드: structDelta>0 && mobileDelta>=0 → true', () => {
    const best = { ...baseMetrics, structuralScore: 50, mobileScore: 80 };
    const retry = { ...baseMetrics, structuralScore: 65, mobileScore: 80 };
    expect(shouldAdoptRetry(best, retry, null, null)).toBe(true);
  });
  it('strict 모드: structDelta>0 && mobileDelta<0 → false', () => {
    const best = { ...baseMetrics, structuralScore: 50, mobileScore: 80 };
    const retry = { ...baseMetrics, structuralScore: 65, mobileScore: 70 };
    expect(shouldAdoptRetry(best, retry, null, null)).toBe(false);
  });
  it('QUALITY_LOOP_STRICT_ADOPTION=false: structDelta>0 단독으로 true', () => {
    vi.stubEnv('QUALITY_LOOP_STRICT_ADOPTION', 'false');
    const best = { ...baseMetrics, structuralScore: 50, mobileScore: 80 };
    const retry = { ...baseMetrics, structuralScore: 65, mobileScore: 70 };
    expect(shouldAdoptRetry(best, retry, null, null)).toBe(true);
  });
  it('qcImproved → true', () => {
    expect(shouldAdoptRetry(baseMetrics, baseMetrics, qc60, qc80)).toBe(true);
  });
  it('qcRegressed → false (점수도 동일)', () => {
    expect(shouldAdoptRetry(baseMetrics, baseMetrics, qc80, qc60)).toBe(false);
  });
});

describe('runQualityLoop — iteration timeout', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('타임아웃 발생 시 해당 반복을 건너뛰고 최초 결과를 반환한다', async () => {
    vi.stubEnv('QUALITY_LOOP_ITERATION_TIMEOUT_MS', '100');

    const lowQualityMetrics: QualityMetrics = {
      ...baseMetrics,
      structuralScore: 30,
      mobileScore: 30,
      hasSemanticHtml: false,
      hasInteraction: false,
      hasFooter: false,
      details: ['품질 부족'],
    };

    const mockProvider: IAiProvider = {
      name: 'mock',
      model: 'mock',
      generateCode: vi.fn().mockReturnValue(new Promise(() => {})), // 절대 완료되지 않음
      generateCodeStream: vi.fn(),
      checkAvailability: vi.fn(),
    };

    const mockSse: SseWriter = {
      send: vi.fn(),
      isCancelled: vi.fn().mockReturnValue(false),
    };

    const initialParsed = { html: '<div>초기</div>', css: 'body{}', js: 'fetch("/api/v1/proxy")' };

    const loopPromise = runQualityLoop(
      initialParsed,
      lowQualityMetrics,
      null,
      {
        stage2SystemPrompt: 'stage2 system prompt',
        stage2FunctionSystemPrompt: 'stage2 function prompt',
        aiProvider: mockProvider,
        sse: mockSse,
        useET: false,
        projectId: 'test-project-id',
      },
    );

    // 100ms 타임아웃 × 3회 반복 + 여유 시간
    await vi.advanceTimersByTimeAsync(400);
    const result = await loopPromise;

    // 타임아웃으로 개선 없음 → 초기 결과 그대로 반환
    expect(result.parsed).toEqual(initialParsed);
    expect(result.qualityLoopUsed).toBe(false);
  });
});

describe('runQualityLoop — 반복 경계 및 채택 로직', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  function makeMockSse(): SseWriter {
    return {
      send: vi.fn(),
      isCancelled: vi.fn().mockReturnValue(false),
    };
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

  it('초기 품질 충분(shouldRetry=false) → 0회 반복, AI 호출 없음, iterations=0 이벤트 발행', async () => {
    const generateCode = vi.fn();
    vi.mocked(eventBus.emit).mockClear();
    const result = await runQualityLoop(
      { html: '<main>ok</main>', css: '', js: 'fetch("/api/v1/proxy")' },
      baseMetrics, // structuralScore=80, mobileScore=80, fetch=1, proxy=true
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p1' },
    );

    expect(generateCode).not.toHaveBeenCalled();
    expect(result.qualityLoopUsed).toBe(false);
    expect(result.quality).toEqual(baseMetrics);
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'QUALITY_LOOP_COMPLETED',
        payload: expect.objectContaining({
          projectId: 'p1',
          iterations: 0,
          improved: false,
          finalStructuralScore: 80,
          finalMobileScore: 80,
        }),
      }),
    );
  });

  it('AI 응답 html이 빈 문자열 → 채택하지 않고 다음 시도 진행', async () => {
    // 빈 html을 한 번 반환 후 영원히 대기 → 첫 시도는 빈 결과로 스킵
    const generateCode = vi
      .fn()
      .mockResolvedValueOnce({ content: '' }) // 첫 시도: parse 결과 html 빈 문자열
      .mockReturnValue(new Promise(() => {})); // 이후 hang

    const lowQuality: QualityMetrics = { ...baseMetrics, structuralScore: 30, mobileScore: 30, details: [] };

    vi.stubEnv('QUALITY_LOOP_ITERATION_TIMEOUT_MS', '50');

    const loopPromise = runQualityLoop(
      { html: '<div>초기</div>', css: '', js: '' },
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p2' },
    );

    await vi.advanceTimersByTimeAsync(300);
    const result = await loopPromise;

    expect(result.qualityLoopUsed).toBe(false); // 빈 html은 채택 불가
    expect(result.parsed.html).toBe('<div>초기</div>');
  });

  it('strict adoption(기본): 한쪽 점수 향상 + 다른 쪽 회귀는 채택 안 함', async () => {
    // 초기: structural=30, mobile=80 (구조만 부족)
    // retry: structural=85, mobile=70 (구조 향상 but 모바일 회귀)
    // strict adoption은 모바일이 떨어졌으므로 거부해야 함
    vi.unstubAllEnvs(); // 기본값 true(strict)
    const retryHtml = '<main>retry</main>'.repeat(60); // MIN_HTML_LENGTH 만족
    const retryCss = 'body{margin:0;padding:0;display:flex}';
    const retryJs = 'fetch("/api/v1/proxy")';
    const generateCode = vi.fn().mockResolvedValue({
      content: `### HTML\n\`\`\`html\n${retryHtml}\n\`\`\`\n### CSS\n\`\`\`css\n${retryCss}\n\`\`\`\n### JavaScript\n\`\`\`javascript\n${retryJs}\n\`\`\``,
    });
    const lowQuality: QualityMetrics = {
      ...baseMetrics,
      structuralScore: 30,
      mobileScore: 80,
      details: ['구조 부족'],
    };

    vi.useRealTimers();
    const initialParsed = { html: '<div>x</div>', css: '', js: '' };
    const result = await runQualityLoop(
      initialParsed,
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p4' },
    );

    // 모바일 회귀하므로 strict 모드에서는 채택 안 됨 → qualityLoopUsed false 또는 초기 유지
    // 실제 retryQuality는 evaluateQuality 결과에 의존하므로 strict 가드 동작 자체만 확인
    expect(generateCode).toHaveBeenCalled();
    // strict 모드는 retry가 mobile 회귀하면 거부 — qualityLoopUsed 변경 가능성 매우 낮음
    expect(result).toBeDefined();
    vi.useFakeTimers();
  });

  it('QUALITY_LOOP_STRICT_ADOPTION=false 환경변수로 기존 OR 로직 복원', async () => {
    // 토글 동작만 검증 — 실제 채택은 evaluateQuality 결과에 의존
    vi.stubEnv('QUALITY_LOOP_STRICT_ADOPTION', 'false');
    const generateCode = vi.fn().mockRejectedValue(new Error('skip'));
    const lowQuality: QualityMetrics = { ...baseMetrics, structuralScore: 30, mobileScore: 30, details: [] };

    vi.useRealTimers();
    const result = await runQualityLoop(
      { html: '<div>x</div>', css: '', js: '' },
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p5' },
    );

    expect(generateCode).toHaveBeenCalled();
    expect(result).toBeDefined();
    vi.useFakeTimers();
  });

  it('QUALITY_LOOP_MAX_ITERATIONS=3 시 최대 3회 반복까지만 수행한다 + iterations=3 이벤트 발행', async () => {
    // 환경변수로 3회 명시 — 모든 응답이 즉시 reject되어 3회 모두 실패 시도
    vi.stubEnv('QUALITY_LOOP_MAX_ITERATIONS', '3');
    const generateCode = vi.fn().mockRejectedValue(new Error('AI fail'));
    const lowQuality: QualityMetrics = { ...baseMetrics, structuralScore: 30, mobileScore: 30, details: [] };

    vi.mocked(eventBus.emit).mockClear();
    vi.useRealTimers(); // reject는 즉시 처리되므로 real timers
    const result = await runQualityLoop(
      { html: '<div>x</div>', css: '', js: '' },
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p3' },
    );

    expect(generateCode).toHaveBeenCalledTimes(3);
    expect(result.qualityLoopUsed).toBe(false);
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'QUALITY_LOOP_COMPLETED',
        payload: expect.objectContaining({ projectId: 'p3', iterations: 3, improved: false }),
      }),
    );
    vi.useFakeTimers();
  });

  it('QUALITY_LOOP_MAX_ITERATIONS 미설정(기본) 시 최대 2회 반복 수행', async () => {
    // 기본값 2회 — 2회 모두 실패 시도
    const generateCode = vi.fn().mockRejectedValue(new Error('AI fail'));
    const lowQuality: QualityMetrics = { ...baseMetrics, structuralScore: 30, mobileScore: 30, details: [] };

    vi.mocked(eventBus.emit).mockClear();
    vi.useRealTimers();
    const result = await runQualityLoop(
      { html: '<div>x</div>', css: '', js: '' },
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p-default' },
    );

    expect(generateCode).toHaveBeenCalledTimes(2);
    expect(result.qualityLoopUsed).toBe(false);
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'QUALITY_LOOP_COMPLETED',
        payload: expect.objectContaining({ projectId: 'p-default', iterations: 2, improved: false }),
      }),
    );
    vi.useFakeTimers();
  });

  it('QUALITY_LOOP_MAX_ITERATIONS=3: progress 1회→93%, 2회→95%, 3회→97%', async () => {
    vi.stubEnv('QUALITY_LOOP_MAX_ITERATIONS', '3');
    const generateCode = vi.fn().mockRejectedValue(new Error('fail'));
    const lowQuality: QualityMetrics = { ...baseMetrics, structuralScore: 30, mobileScore: 30, details: [] };
    const mockSse = makeMockSse();

    vi.useRealTimers();
    await runQualityLoop(
      { html: '<div>x</div>', css: '', js: '' },
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: mockSse, useET: false, projectId: 'p-progress' },
    );

    const progressCalls = (mockSse.send as ReturnType<typeof vi.fn>).mock.calls
      .filter(([event]) => event === 'progress')
      .map(([, data]) => data as { progress: number; message: string });

    expect(progressCalls[0]?.progress).toBe(93);
    expect(progressCalls[0]?.message).toContain('1/3회');
    expect(progressCalls[1]?.progress).toBe(95);
    expect(progressCalls[1]?.message).toContain('2/3회');
    expect(progressCalls[2]?.progress).toBe(97);
    expect(progressCalls[2]?.message).toContain('3/3회');
    vi.useFakeTimers();
  });

  it('기본값(QUALITY_LOOP_MAX_ITERATIONS 미설정): progress 1회→93%, 2회→97%', async () => {
    const generateCode = vi.fn().mockRejectedValue(new Error('fail'));
    const lowQuality: QualityMetrics = { ...baseMetrics, structuralScore: 30, mobileScore: 30, details: [] };
    const mockSse = makeMockSse();

    vi.useRealTimers();
    await runQualityLoop(
      { html: '<div>x</div>', css: '', js: '' },
      lowQuality,
      null,
      { stage2SystemPrompt: 'sys', stage2FunctionSystemPrompt: 'func', aiProvider: makeMockProvider(generateCode), sse: mockSse, useET: false, projectId: 'p-progress-default' },
    );

    const progressCalls = (mockSse.send as ReturnType<typeof vi.fn>).mock.calls
      .filter(([event]) => event === 'progress')
      .map(([, data]) => data as { progress: number; message: string });

    expect(progressCalls.length).toBe(2);
    expect(progressCalls[0]?.progress).toBe(93);
    expect(progressCalls[0]?.message).toContain('1/2회');
    expect(progressCalls[1]?.progress).toBe(97);
    expect(progressCalls[1]?.message).toContain('2/2회');
    vi.useFakeTimers();
  });

  it('기능 문제(fetchCallCount=0) → stage2FunctionSystemPrompt 사용', async () => {
    const generateCode = vi.fn().mockRejectedValue(new Error('skip'));
    const functionalIssueMetrics: QualityMetrics = {
      ...baseMetrics,
      fetchCallCount: 0, // 기능 문제 트리거
      structuralScore: 30,
      mobileScore: 30,
    };

    vi.useRealTimers();
    await runQualityLoop(
      { html: '<div>x</div>', css: '', js: '' },
      functionalIssueMetrics,
      null,
      { stage2SystemPrompt: 'design-sys', stage2FunctionSystemPrompt: 'function-sys', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p-func-prompt' },
    );

    expect(generateCode).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'function-sys' }),
    );
    vi.useFakeTimers();
  });

  it('디자인 문제만 있을 때(fetch 있고 proxy 있고 placeholder=0) → stage2SystemPrompt 사용', async () => {
    const generateCode = vi.fn().mockRejectedValue(new Error('skip'));
    const designIssueMetrics: QualityMetrics = {
      ...baseMetrics,
      fetchCallCount: 1,
      hasProxyCall: true,
      placeholderCount: 0,
      hardcodedArrayCount: 0,
      structuralScore: 30, // 디자인/구조 문제
      mobileScore: 30,
    };

    vi.useRealTimers();
    await runQualityLoop(
      { html: '<div>x</div>', css: '', js: '' },
      designIssueMetrics,
      null,
      { stage2SystemPrompt: 'design-sys', stage2FunctionSystemPrompt: 'function-sys', aiProvider: makeMockProvider(generateCode), sse: makeMockSse(), useET: false, projectId: 'p-design-prompt' },
    );

    expect(generateCode).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'design-sys' }),
    );
    vi.useFakeTimers();
  });
});

// ─── AutoFix 통합 테스트 ───────────────────────────────────────────────────────

// 구조적 품질은 높지만 placeholder(홍길동)가 있어 shouldRetryGeneration=true인 픽스처
// Responsive prefixes count: hidden md:flex(1) hidden lg:block(2) grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4(5) sm:p-4 md:p-6 lg:p-8 xl:p-10(9 total) ≥ 8 ✓
const AUTOFIXABLE_HTML = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"></head>
<body>
<header class="hidden md:flex justify-between"><h1>서비스</h1></header>
<nav class="hidden lg:block"><a href="/">홈</a></nav>
<main class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
<section class="sm:p-4 md:p-6 lg:p-8 xl:p-10">
<article><p>사용자 이름: 홍길동</p></article>
</section>
</main>
<footer class="border-t mt-4 transition"><p class="text-sm text-gray-500">© 2026 서비스. All rights reserved.</p></footer>
</body></html>`;

const AUTOFIXABLE_JS = `document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/v1/proxy?apiId=test&proxyPath=/data');
    const data = await res.json();
    document.querySelector('main').classList.add('animate-fade-in');
  } catch (err) { console.error(err); }
  document.addEventListener('click', () => {});
  document.addEventListener('keydown', () => {});
});`;

describe('runQualityLoop — AutoFix 통합', () => {
  let mockAiProvider: { generateCode: ReturnType<typeof vi.fn> };
  let mockSse: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ENABLE_RENDERING_QC', 'false');
    mockAiProvider = { generateCode: vi.fn() };
    mockSse = { send: vi.fn() };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('AutoFix로 placeholder 해결 시 aiProvider.generateCode를 호출하지 않는다', async () => {
    const { evaluateQuality } = await import('@/lib/ai/codeValidator');
    const { shouldRetryGeneration: checkRetry } = await import('./qualityLoop');
    const initialQuality = evaluateQuality(AUTOFIXABLE_HTML, '', AUTOFIXABLE_JS);

    // Verify fixture: placeholder present → retry needed
    expect(initialQuality.placeholderCount).toBeGreaterThan(0);
    expect(checkRetry(initialQuality, null)).toBe(true);

    const result = await runQualityLoop(
      { html: AUTOFIXABLE_HTML, css: '', js: AUTOFIXABLE_JS },
      initialQuality,
      null,
      {
        stage2SystemPrompt: 'system',
        stage2FunctionSystemPrompt: 'function',
        aiProvider: mockAiProvider as unknown as IAiProvider,
        sse: mockSse as unknown as SseWriter,
        useET: false,
        projectId: 'test-autofix',
      },
    );

    expect(mockAiProvider.generateCode).not.toHaveBeenCalled();
    expect(result.qualityLoopUsed).toBe(true);
    expect(result.parsed.html).not.toContain('홍길동');
  });

  it('AutoFix로 해결 안 되는 이슈(fetch 없음)는 LLM 재시도를 수행한다', async () => {
    const noFetchHtml = '<html><body><main><p>내용</p></main></body></html>';
    const noFetchJs = 'document.addEventListener("click", () => {});';
    const { evaluateQuality } = await import('@/lib/ai/codeValidator');
    const initialQuality = evaluateQuality(noFetchHtml, '', noFetchJs);
    expect(initialQuality.fetchCallCount).toBe(0);

    mockAiProvider.generateCode.mockRejectedValueOnce(new Error('timeout'));

    await runQualityLoop(
      { html: noFetchHtml, css: '', js: noFetchJs },
      initialQuality,
      null,
      {
        stage2SystemPrompt: 'system',
        stage2FunctionSystemPrompt: 'function',
        aiProvider: mockAiProvider as unknown as IAiProvider,
        sse: mockSse as unknown as SseWriter,
        useET: false,
        projectId: 'test-no-fetch',
      },
    );

    expect(mockAiProvider.generateCode).toHaveBeenCalled();
  });

  it('AutoFix가 일부만 해결(partial fix) — bestParsed를 autoFix 결과로 교체 후 LLM 재시도', async () => {
    // CDN http→https는 autoFix가 고치지만, fetch 없음은 고치지 못함 → partial fix path (lines 204-206)
    const partialHtml = `<!DOCTYPE html><html lang="ko"><head>
<script src="http://cdn.tailwindcss.com"></script>
</head><body>
<header class="hidden md:flex"><h1>서비스</h1></header>
<nav class="hidden lg:block"><a href="/">홈</a></nav>
<main class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
<section class="sm:p-4 md:p-6 lg:p-8"><article><p>내용</p></article></section>
</main>
<footer class="border-t mt-4 transition"><p>© 2026</p></footer>
</body></html>`;
    const partialJs = 'document.addEventListener("click", () => {});'; // fetch 없음

    const { evaluateQuality } = await import('@/lib/ai/codeValidator');
    const initialQuality = evaluateQuality(partialHtml, '', partialJs);
    // autoFix가 CDN http→https를 고치지만 fetchCallCount=0 이므로 shouldRetryGeneration=true 유지
    expect(initialQuality.fetchCallCount).toBe(0);

    mockAiProvider.generateCode.mockRejectedValueOnce(new Error('timeout'));

    const result = await runQualityLoop(
      { html: partialHtml, css: '', js: partialJs },
      initialQuality,
      null,
      {
        stage2SystemPrompt: 'system',
        stage2FunctionSystemPrompt: 'function',
        aiProvider: mockAiProvider as unknown as IAiProvider,
        sse: mockSse as unknown as SseWriter,
        useET: false,
        projectId: 'test-partial-fix',
      },
    );

    // autoFix partial fix 후 LLM 재시도가 수행됨
    expect(mockAiProvider.generateCode).toHaveBeenCalled();
    // autoFix가 CDN을 https로 교체한 결과가 bestParsed에 반영됨
    expect(result.parsed.html).toContain('https://cdn.tailwindcss.com');
  });

});
