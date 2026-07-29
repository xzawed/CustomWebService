import { describe, it, expect, vi, afterEach } from 'vitest';

// features.ts는 모듈 로드 시 env()를 평가하는 상수(DEFAULT_LIMITS)를 생성하므로,
// isNaN 분기를 테스트하려면 vi.resetModules() + 동적 import가 필요하다.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('features config — env() isNaN fallback', () => {
  it('MAX_APIS_PER_PROJECT가 비숫자 문자열이면 기본값(5)을 사용한다', async () => {
    vi.stubEnv('MAX_APIS_PER_PROJECT', 'invalid');
    const { getLimits } = await import('./features');
    const limits = getLimits('free');
    expect(limits.maxApisPerProject).toBe(5);
  });

  it('MAX_DAILY_GENERATIONS가 비숫자 문자열이면 기본값(10)을 사용한다', async () => {
    vi.stubEnv('MAX_DAILY_GENERATIONS', 'not-a-number');
    const { getLimits } = await import('./features');
    const limits = getLimits('free');
    expect(limits.maxDailyGenerations).toBe(10);
  });

  it('MAX_DAILY_SUGGESTIONS 미설정 시 free 기본값(30)을 사용한다', async () => {
    const { getLimits } = await import('./features');
    const limits = getLimits('free');
    expect(limits.maxDailySuggestions).toBe(30);
  });

  it('MAX_DAILY_SUGGESTIONS가 비숫자 문자열이면 기본값(30)을 사용한다', async () => {
    vi.stubEnv('MAX_DAILY_SUGGESTIONS', 'not-a-number');
    const { getLimits } = await import('./features');
    const limits = getLimits('free');
    expect(limits.maxDailySuggestions).toBe(30);
  });

  it('pro 플랜에서는 maxDailySuggestions 오버라이드(150)가 적용된다', async () => {
    const { getLimits } = await import('./features');
    const limits = getLimits('pro');
    expect(limits.maxDailySuggestions).toBe(150);
  });

  it('비숫자 문자열 env면 기본값을 사용한다 (env() NaN 폴백)', async () => {
    vi.stubEnv('MAX_APIS_PER_PROJECT', 'abc');
    const { getLimits } = await import('./features');
    const limits = getLimits('free');
    expect(limits.maxApisPerProject).toBe(5);
  });

  it('숫자 문자열이면 파싱된 값을 사용한다', async () => {
    vi.stubEnv('MAX_APIS_PER_PROJECT', '8');
    const { getLimits } = await import('./features');
    const limits = getLimits('free');
    expect(limits.maxApisPerProject).toBe(8);
  });

  it('pro 플랜에서는 PLAN_OVERRIDES 값이 우선 적용된다', async () => {
    vi.stubEnv('MAX_APIS_PER_PROJECT', 'invalid');
    const { getLimits } = await import('./features');
    const limits = getLimits('pro');
    // pro 오버라이드: maxApisPerProject = 10
    expect(limits.maxApisPerProject).toBe(10);
  });
});
