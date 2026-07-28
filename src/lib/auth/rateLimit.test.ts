import { describe, it, expect } from 'vitest';
import { checkRateLimit, getClientIp } from './rateLimit';

describe('rateLimit', () => {
  it('한도까지 true, 초과 시 false', () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(false);
  });
  it('getClientIp는 x-forwarded-for 최우측 IP(마지막 프록시가 덧붙인 값)를 사용한다', () => {
    const req = new Request('https://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    expect(getClientIp(req)).toBe('5.6.7.8');
  });
  it('getClientIp는 클라이언트가 위조한 최좌측 XFF 항목을 신뢰하지 않는다', () => {
    // 공격자가 매 요청마다 다른 최좌측 값을 넣어도 레이트리밋 키가 갈라지면 안 된다.
    const forge = (spoofed: string) =>
      new Request('https://x', { headers: { 'x-forwarded-for': `${spoofed}, 203.0.113.9` } });
    expect(getClientIp(forge('1.1.1.1'))).toBe('203.0.113.9');
    expect(getClientIp(forge('2.2.2.2'))).toBe('203.0.113.9');
  });
  it('getClientIp는 단일 항목 XFF를 그대로 반환한다', () => {
    const req = new Request('https://x', { headers: { 'x-forwarded-for': '203.0.113.9' } });
    expect(getClientIp(req)).toBe('203.0.113.9');
  });
  // x-real-ip는 신뢰 경계가 붙였다는 보장이 없어 클라이언트가 위조·회전할 수 있다.
  // 폴백을 두면 XFF 없는 경로에서 per-IP 한도가 통째로 무력화되므로 신뢰하지 않는다.
  it('getClientIp는 XFF가 없으면 x-real-ip를 신뢰하지 않고 unknown을 반환한다', () => {
    const req = new Request('https://x', { headers: { 'x-real-ip': '198.51.100.7' } });
    expect(getClientIp(req)).toBe('unknown');
  });
  it('getClientIp는 XFF가 빈 문자열이어도 x-real-ip를 신뢰하지 않는다', () => {
    const req = new Request('https://x', { headers: { 'x-forwarded-for': '', 'x-real-ip': '198.51.100.7' } });
    expect(getClientIp(req)).toBe('unknown');
  });
  it('getClientIp는 어떤 헤더도 없을 시 "unknown" 반환', () => {
    const req = new Request('https://x');
    expect(getClientIp(req)).toBe('unknown');
  });
});
