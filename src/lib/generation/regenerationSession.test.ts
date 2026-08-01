import { afterEach, describe, expect, it } from 'vitest';
import {
  abortRegenerationSession,
  beginRegenerationSession,
  __resetRegenerationSessionForTests,
} from './regenerationSession';

describe('regenerationSession', () => {
  afterEach(() => {
    __resetRegenerationSessionForTests();
  });

  it('beginRegenerationSession 은 이전 signal 을 abort 한다', () => {
    const first = beginRegenerationSession();
    expect(first.aborted).toBe(false);

    const second = beginRegenerationSession();
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
  });

  it('연속 begin 시 첫 signal 만 abort 되고 둘째는 살아 있다', () => {
    const a = beginRegenerationSession();
    const b = beginRegenerationSession();
    expect(a.aborted).toBe(true);
    expect(b.aborted).toBe(false);

    const c = beginRegenerationSession();
    expect(a.aborted).toBe(true);
    expect(b.aborted).toBe(true);
    expect(c.aborted).toBe(false);
  });

  it('abortRegenerationSession 은 현재 signal 을 abort 하고 비운다', () => {
    const signal = beginRegenerationSession();
    abortRegenerationSession();
    expect(signal.aborted).toBe(true);

    // 다시 abort 해도 안전 (no-op)
    abortRegenerationSession();
  });

  it('abort 후 begin 은 새 비-abort signal 을 준다', () => {
    const first = beginRegenerationSession();
    abortRegenerationSession();
    expect(first.aborted).toBe(true);

    const next = beginRegenerationSession();
    expect(next.aborted).toBe(false);
    expect(next).not.toBe(first);
  });

  it('__resetRegenerationSessionForTests 는 현재 세션을 끊는다', () => {
    const signal = beginRegenerationSession();
    __resetRegenerationSessionForTests();
    expect(signal.aborted).toBe(true);
  });
});
