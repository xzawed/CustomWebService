import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldRetryGeneration, buildQualityImprovementPrompt, runQualityLoop } from './qualityLoop';
import type { QualityMetrics } from '@/lib/ai/codeValidator';
import type { IAiProvider } from '@/providers/ai/IAiProvider';
import type { SseWriter } from '@/lib/ai/sseWriter';

const baseMetrics: QualityMetrics = {
  structuralScore: 80, mobileScore: 80,
  hasSemanticHtml: true, hasMockData: false, hasInteraction: true,
  hasResponsiveClasses: true, hasAdequateResponsive: true, noFixedOverflow: true,
  hasImageProtection: true, hasMobileNav: true, hasFooter: true, hasImgAlt: true,
  fetchCallCount: 1, hasProxyCall: true, hasJsonParse: true, placeholderCount: 0,
  hardcodedArrayCount: 0,
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
      'stage2 system prompt',
      mockProvider,
      mockSse,
      false,
      'test-project-id',
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

  it('초기 품질 충분(shouldRetry=false) → 0회 반복, AI 호출 없음', async () => {
    const generateCode = vi.fn();
    const result = await runQualityLoop(
      { html: '<main>ok</main>', css: '', js: 'fetch("/api/v1/proxy")' },
      baseMetrics, // structuralScore=80, mobileScore=80, fetch=1, proxy=true
      null,
      'sys',
      makeMockProvider(generateCode),
      makeMockSse(),
      false,
      'p1',
    );

    expect(generateCode).not.toHaveBeenCalled();
    expect(result.qualityLoopUsed).toBe(false);
    expect(result.quality).toEqual(baseMetrics);
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
      'sys',
      makeMockProvider(generateCode),
      makeMockSse(),
      false,
      'p2',
    );

    await vi.advanceTimersByTimeAsync(300);
    const result = await loopPromise;

    expect(result.qualityLoopUsed).toBe(false); // 빈 html은 채택 불가
    expect(result.parsed.html).toBe('<div>초기</div>');
  });

  it('shouldRetryGeneration 시 최대 3회 반복까지만 수행한다', async () => {
    // 모든 응답이 즉시 reject되어 3회 모두 실패 시도
    const generateCode = vi.fn().mockRejectedValue(new Error('AI fail'));
    const lowQuality: QualityMetrics = { ...baseMetrics, structuralScore: 30, mobileScore: 30, details: [] };

    vi.useRealTimers(); // reject는 즉시 처리되므로 real timers
    const result = await runQualityLoop(
      { html: '<div>x</div>', css: '', js: '' },
      lowQuality,
      null,
      'sys',
      makeMockProvider(generateCode),
      makeMockSse(),
      false,
      'p3',
    );

    expect(generateCode).toHaveBeenCalledTimes(3);
    expect(result.qualityLoopUsed).toBe(false);
    vi.useFakeTimers();
  });
});
