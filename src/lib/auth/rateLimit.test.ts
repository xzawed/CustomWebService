import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkRateLimit,
  getClientIp,
  isLimited,
  recordFailure,
  clearKey,
  __resetAuthRateLimit,
} from './rateLimit';
import { MAX_AUTH_RATE_LIMIT_BUCKETS } from '@/lib/config/rateLimit';

describe('rateLimit', () => {
  beforeEach(() => {
    __resetAuthRateLimit();
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetAuthRateLimit();
  });

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
    const req = new Request('https://x', {
      headers: { 'x-forwarded-for': '', 'x-real-ip': '198.51.100.7' },
    });
    expect(getClientIp(req)).toBe('unknown');
  });

  it('getClientIp는 어떤 헤더도 없을 시 "unknown" 반환', () => {
    const req = new Request('https://x');
    expect(getClientIp(req)).toBe('unknown');
  });

  /**
   * Auth.js (@auth/core@0.41.3) Credentials authorize 두 번째 인자는
   * `new Request(url, { headers, method, body: JSON.stringify(body) })` 로
   * 재구성된다 (callback/index.js — TODO: "Forward the original request as is").
   * 헤더가 plain object로 들어가면 getClientIp가 최우측 XFF를 읽어야 한다.
   * 패키지가 헤더를 빼면 모든 IP가 'unknown'으로 붕괴하므로 여기서 고정한다.
   */
  it('getClientIp는 @auth/core가 재구성하는 Request 형태에서도 최우측 XFF를 읽는다', () => {
    const headers = Object.fromEntries(
      new Headers({
        'x-forwarded-for': '198.51.100.1, 203.0.113.50',
        'content-type': 'application/json',
      }),
    );
    const request = new Request('https://xzawed.xyz/api/auth/callback/credentials', {
      headers,
      method: 'POST',
      body: JSON.stringify({ email: 'a@example.com', password: 'x' }),
    });
    expect(getClientIp(request)).toBe('203.0.113.50');
  });

  describe('isLimited / recordFailure / clearKey', () => {
    it('isLimited는 읽기 전용 — 버킷을 만들거나 증가시키지 않는다', () => {
      const key = 'ro-key';
      expect(isLimited(key, 3)).toBe(false);
      expect(isLimited(key, 3)).toBe(false);
      // 아직 버킷이 없으므로 첫 recordFailure가 count=1
      expect(recordFailure(key, 60_000)).toBe(true);
      expect(isLimited(key, 1)).toBe(true);
      // isLimited를 여러 번 호출해도 count가 늘지 않는다(limit 2면 아직 미달)
      expect(recordFailure(key, 60_000)).toBe(true); // count=2
      expect(isLimited(key, 3)).toBe(false);
      expect(isLimited(key, 3)).toBe(false);
      expect(isLimited(key, 3)).toBe(false);
      expect(recordFailure(key, 60_000)).toBe(true); // count=3
      expect(isLimited(key, 3)).toBe(true);
    });

    it('recordFailure는 생성·증가하고, isLimited는 limit 이상일 때 true', () => {
      const key = 'fail-key';
      expect(recordFailure(key, 60_000)).toBe(true);
      expect(isLimited(key, 2)).toBe(false);
      expect(recordFailure(key, 60_000)).toBe(true);
      expect(isLimited(key, 2)).toBe(true);
    });

    it('윈도우 만료 후 isLimited는 false이고 다시 기록할 수 있다', () => {
      vi.useFakeTimers();
      const key = 'expire-key';
      const windowMs = 5_000;
      expect(recordFailure(key, windowMs)).toBe(true);
      expect(recordFailure(key, windowMs)).toBe(true);
      expect(isLimited(key, 2)).toBe(true);

      vi.advanceTimersByTime(windowMs + 1);
      expect(isLimited(key, 2)).toBe(false);
      expect(recordFailure(key, windowMs)).toBe(true);
      expect(isLimited(key, 1)).toBe(true);
    });

    it('clearKey는 해당 키만 제거한다', () => {
      const a = 'clear-a';
      const b = 'clear-b';
      recordFailure(a, 60_000);
      recordFailure(b, 60_000);
      clearKey(a);
      expect(isLimited(a, 1)).toBe(false);
      expect(isLimited(b, 1)).toBe(true);
    });

    it('만료된 버킷만 정리하고 활성 윈도는 유지한다 (cap 도달 시 신규 키 거부)', () => {
      vi.useFakeTimers();
      const windowMs = 60_000;

      // 활성 윈도 하나를 먼저 채운다 — 이 카운터는 cap 이후에도 살아 있어야 한다.
      const activeKey = 'active-window';
      expect(recordFailure(activeKey, windowMs)).toBe(true);
      expect(recordFailure(activeKey, windowMs)).toBe(true);
      expect(isLimited(activeKey, 2)).toBe(true);

      // 나머지 슬롯을 만료 예정 키로 채운다.
      for (let i = 0; i < MAX_AUTH_RATE_LIMIT_BUCKETS - 1; i++) {
        expect(recordFailure(`fill-${i}`, windowMs)).toBe(true);
      }

      // 신규 키는 거부
      expect(recordFailure('new-while-full', windowMs)).toBe(false);
      expect(checkRateLimit('check-while-full', 5, windowMs)).toBe(false);
      // 활성 윈도는 보존 (count가 리셋되지 않음)
      expect(isLimited(activeKey, 2)).toBe(true);
      // 활성 키에 대한 추가 기록은 기존 버킷이므로 성공
      expect(recordFailure(activeKey, windowMs)).toBe(true);

      // 만료 후 슬롯이 비면 신규 허용
      vi.advanceTimersByTime(windowMs + 1);
      expect(recordFailure('after-expiry', windowMs)).toBe(true);
      expect(isLimited('after-expiry', 1)).toBe(true);
    });

    it('isLimited는 cap 도달 후 없는 키에 대해 fail-closed(true)한다', () => {
      const windowMs = 60_000;
      for (let i = 0; i < MAX_AUTH_RATE_LIMIT_BUCKETS; i++) {
        expect(recordFailure(`cap-${i}`, windowMs)).toBe(true);
      }
      // 맵에 없는 키라도 용량이 꽉 차면 true — 키 회전으로 무한 첫 실패를 막는 안전장치
      expect(isLimited('never-seen-key', 5)).toBe(true);
      // 기존 활성 키 조회는 계속 동작
      expect(isLimited('cap-0', 1)).toBe(true);
    });

    it('checkRateLimit도 cap에서 fail-closed하며 활성 윈도를 버리지 않는다', () => {
      const windowMs = 60_000;
      const active = 'check-active';
      expect(checkRateLimit(active, 3, windowMs)).toBe(true);
      expect(checkRateLimit(active, 3, windowMs)).toBe(true);
      // count=2, limit=3 이므로 아직 허용

      for (let i = 0; i < MAX_AUTH_RATE_LIMIT_BUCKETS - 1; i++) {
        expect(checkRateLimit(`cfill-${i}`, 10, windowMs)).toBe(true);
      }

      expect(checkRateLimit('brand-new', 10, windowMs)).toBe(false);
      // 활성 키는 세 번째 시도까지 허용 (evict되어 count:1로 리셋되면 안 됨)
      expect(checkRateLimit(active, 3, windowMs)).toBe(true);
      expect(checkRateLimit(active, 3, windowMs)).toBe(false);
    });
  });
});
