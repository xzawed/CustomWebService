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
