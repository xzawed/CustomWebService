import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkSiteRateLimit, __resetSiteRateLimit } from './siteRateLimit';
import {
  SITE_PROXY_RATE_LIMIT_PER_MIN,
  SITE_PROXY_PROJECT_LIMIT_PER_MIN,
  MAX_SITE_RATE_LIMIT_BUCKETS,
} from '@/lib/config/rateLimit';

describe('checkSiteRateLimit', () => {
  beforeEach(() => {
    __resetSiteRateLimit();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    __resetSiteRateLimit();
  });

  it('한도 내에서는 허용한다', () => {
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN; i++) {
      expect(checkSiteRateLimit('1.1.1.1', 'p1').allowed).toBe(true);
    }
  });

  it('IP+projectId 한도 초과 시 차단하고 retryAfter를 준다', () => {
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN; i++) checkSiteRateLimit('1.1.1.1', 'p1');
    const res = checkSiteRateLimit('1.1.1.1', 'p1');
    expect(res.allowed).toBe(false);
    expect(res.retryAfterSec).toBeGreaterThan(0);
  });

  it('다른 IP는 서로 영향을 주지 않는다', () => {
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN; i++) checkSiteRateLimit('1.1.1.1', 'p1');
    expect(checkSiteRateLimit('2.2.2.2', 'p1').allowed).toBe(true);
  });

  it('같은 IP라도 프로젝트가 다르면 버킷이 분리된다', () => {
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN; i++) checkSiteRateLimit('1.1.1.1', 'p1');
    expect(checkSiteRateLimit('1.1.1.1', 'p2').allowed).toBe(true);
  });

  it('윈도가 지나면 리셋된다', () => {
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN; i++) checkSiteRateLimit('1.1.1.1', 'p1');
    expect(checkSiteRateLimit('1.1.1.1', 'p1').allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(checkSiteRateLimit('1.1.1.1', 'p1').allowed).toBe(true);
  });

  it('분산 IP여도 프로젝트 전역 한도에서 차단된다', () => {
    let allowed = 0;
    // IP를 매번 바꿔 IP 버킷은 항상 여유가 있게 한다.
    for (let i = 0; i < SITE_PROXY_PROJECT_LIMIT_PER_MIN + 10; i++) {
      if (checkSiteRateLimit(`10.0.${Math.floor(i / 250)}.${i % 250}`, 'p1').allowed) allowed++;
    }
    expect(allowed).toBe(SITE_PROXY_PROJECT_LIMIT_PER_MIN);
  });

  it('용량 압박이 있어도 활성 윈도의 카운터를 리셋하지 않는다', () => {
    // 기존 프록시 리미터(LRUMap)는 eviction 시 활성 카운터가 사라져 한도를 우회할 수 있다.
    // 이 리미터는 만료 항목만 정리하므로 살아 있는 카운터가 유지되어야 한다.
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN; i++) checkSiteRateLimit('1.1.1.1', 'p1');
    // 다른 버킷을 대량 생성해 용량을 압박한다.
    const flood = MAX_SITE_RATE_LIMIT_BUCKETS + 500;
    for (let i = 0; i < flood; i++) {
      checkSiteRateLimit(`9.9.${Math.floor(i / 250) % 250}.${i % 250}`, `pX${i}`);
    }
    expect(checkSiteRateLimit('1.1.1.1', 'p1').allowed).toBe(false);
  });

  it('retryAfterSec은 최소 1초 이상이다', () => {
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN; i++) checkSiteRateLimit('1.1.1.1', 'p1');
    // 윈도 끝자락으로 이동해도 0초가 반환되면 클라이언트가 즉시 재시도한다.
    vi.advanceTimersByTime(59_999);
    expect(checkSiteRateLimit('1.1.1.1', 'p1').retryAfterSec).toBeGreaterThanOrEqual(1);
  });
});
