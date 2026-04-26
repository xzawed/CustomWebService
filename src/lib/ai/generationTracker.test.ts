import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GenerationTracker', () => {
  it('start()는 generating 상태의 엔트리를 생성한다', async () => {
    const { generationTracker, stopCleanup } = await import('./generationTracker');
    generationTracker.start('p1', 'user-1');

    const entry = generationTracker.get('p1');
    expect(entry?.status).toBe('generating');
    expect(entry?.userId).toBe('user-1');
    expect(entry?.progress).toBe(0);
    expect(entry?.step).toBe('initializing');

    stopCleanup();
  });

  it('updateProgress()는 progress, step, message를 갱신한다', async () => {
    const { generationTracker, stopCleanup } = await import('./generationTracker');
    generationTracker.start('p2', 'user-1');
    generationTracker.updateProgress('p2', 50, 'stage1_generating', '1단계 생성 중...');

    const entry = generationTracker.get('p2');
    expect(entry?.progress).toBe(50);
    expect(entry?.step).toBe('stage1_generating');
    expect(entry?.message).toBe('1단계 생성 중...');

    stopCleanup();
  });

  it('complete()는 status를 completed로 설정하고 result를 저장한다', async () => {
    const { generationTracker, stopCleanup } = await import('./generationTracker');
    const result = { projectId: 'p3', version: 1, previewUrl: 'https://example.com' };
    generationTracker.start('p3', 'user-1');
    generationTracker.complete('p3', result);

    const entry = generationTracker.get('p3');
    expect(entry?.status).toBe('completed');
    expect(entry?.progress).toBe(100);
    expect(entry?.result).toEqual(result);

    stopCleanup();
  });

  it('fail()은 status를 failed로 설정하고 error를 저장한다', async () => {
    const { generationTracker, stopCleanup } = await import('./generationTracker');
    generationTracker.start('p4', 'user-1');
    generationTracker.fail('p4', 'AI 응답 오류');

    const entry = generationTracker.get('p4');
    expect(entry?.status).toBe('failed');
    expect(entry?.error).toBe('AI 응답 오류');

    stopCleanup();
  });

  it('get()은 존재하지 않는 projectId에 대해 undefined를 반환한다', async () => {
    const { generationTracker, stopCleanup } = await import('./generationTracker');
    expect(generationTracker.get('unknown-id')).toBeUndefined();
    stopCleanup();
  });

  it('isGenerating()은 generating 상태에서 true, completed 이후 false를 반환한다', async () => {
    const { generationTracker, stopCleanup } = await import('./generationTracker');
    generationTracker.start('p5', 'user-1');
    expect(generationTracker.isGenerating('p5')).toBe(true);

    generationTracker.complete('p5', { projectId: 'p5', version: 1, previewUrl: '' });
    expect(generationTracker.isGenerating('p5')).toBe(false);

    stopCleanup();
  });

  it('generating 엔트리는 30분 TTL 후 cleanup에서 제거된다', async () => {
    vi.useFakeTimers();
    const { generationTracker, stopCleanup } = await import('./generationTracker');

    generationTracker.start('p6', 'user-1');
    expect(generationTracker.get('p6')).toBeDefined();

    // Advance past 30-minute TTL; cleanup interval fires every 60s
    vi.advanceTimersByTime(31 * 60 * 1000);

    expect(generationTracker.get('p6')).toBeUndefined();
    stopCleanup();
  });

  it('completed 엔트리는 10분 TTL 후 cleanup에서 제거된다', async () => {
    vi.useFakeTimers();
    const { generationTracker, stopCleanup } = await import('./generationTracker');

    generationTracker.start('p7', 'user-1');
    generationTracker.complete('p7', { projectId: 'p7', version: 1, previewUrl: '' });
    expect(generationTracker.get('p7')).toBeDefined();

    // Still present at 9 minutes
    vi.advanceTimersByTime(9 * 60 * 1000);
    expect(generationTracker.get('p7')).toBeDefined();

    // Gone after 11 minutes total
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(generationTracker.get('p7')).toBeUndefined();
    stopCleanup();
  });
});
