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
      'sys',
      makeMockProvider(generateCode),
      makeMockSse(),
      false,
      'p-adopt-1',
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
      'sys',
      makeMockProvider(generateCode),
      makeMockSse(),
      false,
      'p-adopt-2',
    );

    expect(result.qualityLoopUsed).toBe(true);
    expect(result.quality.structuralScore).toBe(50);
  });

  it('retry quality 한쪽 향상 + 한쪽 회귀는 strict 모드에서 거부한다', async () => {
    // strict 가드: structuralScore↑ but mobileScore↓ → 거부
    // shouldRetryGeneration이 다음 attempt에서 또 true가 되도록 retry quality는 여전히 미달
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
      'sys',
      makeMockProvider(generateCode),
      makeMockSse(),
      false,
      'p-adopt-3',
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
      'sys',
      makeMockProvider(generateCode),
      makeMockSse(),
      false,
      'p-adopt-4',
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
      'sys',
      makeMockProvider(generateCode),
      makeMockSse(),
      false,
      'p-adopt-qc',
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
      'sys',
      makeMockProvider(generateCode),
      makeMockSse(),
      false,
      'p-adopt-qc-fail',
    );

    expect(result.qualityLoopUsed).toBe(true); // QC 실패해도 코드 점수로 채택
  });
});
