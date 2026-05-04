import { describe, it, expect, vi, afterEach } from 'vitest';

// qc.ts도 모듈 로드 시 envInt()를 평가하는 상수를 생성하므로
// isNaN 분기는 vi.resetModules() + 동적 import로만 테스트 가능하다.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('qc config — envInt() isNaN fallback', () => {
  it('QC_QUALITY_THRESHOLD가 비숫자 문자열이면 기본값(60)을 사용한다', async () => {
    vi.stubEnv('QC_QUALITY_THRESHOLD', 'invalid');
    const { QC_THRESHOLDS } = await import('./qc');
    expect(QC_THRESHOLDS.QUALITY).toBe(60);
  });

  it('QC_MOBILE_THRESHOLD가 비숫자 문자열이면 기본값(60)을 사용한다', async () => {
    vi.stubEnv('QC_MOBILE_THRESHOLD', 'not-a-number');
    const { QC_THRESHOLDS } = await import('./qc');
    expect(QC_THRESHOLDS.MOBILE).toBe(60);
  });

  it('QC_FAST_PASS_THRESHOLD가 비숫자 문자열이면 기본값(60)을 사용한다', async () => {
    vi.stubEnv('QC_FAST_PASS_THRESHOLD', 'abc');
    const { QC_THRESHOLDS } = await import('./qc');
    expect(QC_THRESHOLDS.FAST_PASS).toBe(60);
  });

  it('QC_DEEP_PASS_THRESHOLD가 비숫자 문자열이면 기본값(70)을 사용한다', async () => {
    vi.stubEnv('QC_DEEP_PASS_THRESHOLD', 'xyz');
    const { QC_THRESHOLDS } = await import('./qc');
    expect(QC_THRESHOLDS.DEEP_PASS).toBe(70);
  });

  it('QC_FAST_TIMEOUT_MS가 비숫자 문자열이면 기본값(3000)을 사용한다', async () => {
    vi.stubEnv('QC_FAST_TIMEOUT_MS', 'nope');
    const { QC_TIMEOUTS } = await import('./qc');
    expect(QC_TIMEOUTS.FAST_MS).toBe(3000);
  });

  it('QC_DEEP_TIMEOUT_MS가 비숫자 문자열이면 기본값(10000)을 사용한다', async () => {
    vi.stubEnv('QC_DEEP_TIMEOUT_MS', 'bad');
    const { QC_TIMEOUTS } = await import('./qc');
    expect(QC_TIMEOUTS.DEEP_MS).toBe(10000);
  });

  it('숫자 문자열이면 파싱된 값을 사용한다', async () => {
    vi.stubEnv('QC_QUALITY_THRESHOLD', '75');
    const { QC_THRESHOLDS } = await import('./qc');
    expect(QC_THRESHOLDS.QUALITY).toBe(75);
  });
});
