import { describe, it, expect } from 'vitest';
import { checkRateLimit, getClientIp } from './rateLimit';

describe('rateLimit', () => {
  it('한도까지 true, 초과 시 false', () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(false);
  });
  it('getClientIp는 x-forwarded-for 첫 IP', () => {
    const req = new Request('https://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });
  it('getClientIp는 x-forwarded-for 헤더 없을 시 "unknown" 반환', () => {
    const req = new Request('https://x');
    expect(getClientIp(req)).toBe('unknown');
  });
});
