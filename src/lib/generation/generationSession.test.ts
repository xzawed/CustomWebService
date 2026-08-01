import { afterEach, describe, expect, it } from 'vitest';
import {
  abortGenerationSession,
  beginGenerationSession,
  __resetGenerationSessionForTests,
} from './generationSession';

describe('generationSession', () => {
  afterEach(() => {
    __resetGenerationSessionForTests();
  });

  it('beginGenerationSession 은 이전 signal 을 abort 한다', () => {
    const first = beginGenerationSession();
    expect(first.aborted).toBe(false);

    const second = beginGenerationSession();
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
  });

  it('연속 begin 시 첫 signal 만 abort 되고 둘째는 살아 있다', () => {
    const a = beginGenerationSession();
    const b = beginGenerationSession();
    expect(a.aborted).toBe(true);
    expect(b.aborted).toBe(false);

    const c = beginGenerationSession();
    expect(a.aborted).toBe(true);
    expect(b.aborted).toBe(true);
    expect(c.aborted).toBe(false);
  });

  it('abortGenerationSession 은 현재 signal 을 abort 하고 비운다', () => {
    const signal = beginGenerationSession();
    abortGenerationSession();
    expect(signal.aborted).toBe(true);

    // 다시 abort 해도 안전 (no-op)
    abortGenerationSession();
  });

  it('abort 후 begin 은 새 비-abort signal 을 준다', () => {
    const first = beginGenerationSession();
    abortGenerationSession();
    expect(first.aborted).toBe(true);

    const next = beginGenerationSession();
    expect(next.aborted).toBe(false);
    expect(next).not.toBe(first);
  });

  it('__resetGenerationSessionForTests 는 현재 세션을 끊는다', () => {
    const signal = beginGenerationSession();
    __resetGenerationSessionForTests();
    expect(signal.aborted).toBe(true);
  });
});
