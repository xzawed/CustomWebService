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

/** 분산 IP로 프로젝트 전역 한도를 소진시킨다(IP 버킷은 항상 여유). */
function exhaustProjectLimit(projectId: string, extra = 0): void {
  for (let i = 0; i < SITE_PROXY_PROJECT_LIMIT_PER_MIN + extra; i++) {
    checkSiteRateLimit(`10.0.${Math.floor(i / 250)}.${i % 250}`, projectId);
  }
}

describe('프로젝트 전역 한도 소진 경고 (#200)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetSiteRateLimit();
    vi.useFakeTimers();
    const { logger } = await import('@/lib/utils/logger');
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    vi.useRealTimers();
    __resetSiteRateLimit();
  });

  function projectLimitWarnings(): unknown[][] {
    const calls = warnSpy.mock.calls as unknown as unknown[][];
    return calls.filter((c) => c[0] === 'Site proxy project limit reached');
  }

  it('프로젝트 전역 한도에 도달하면 경고를 남긴다 — 429만으로는 아무 신호도 남지 않았다', () => {
    exhaustProjectLimit('p1', 1);

    expect(projectLimitWarnings()).toHaveLength(1);
    expect(projectLimitWarnings()[0][1]).toMatchObject({
      projectId: 'p1',
      limit: SITE_PROXY_PROJECT_LIMIT_PER_MIN,
    });
  });

  it('같은 윈도에서 계속 초과해도 경고는 1회만 — 봇이 두드리면 로그가 폭발한다', () => {
    exhaustProjectLimit('p1', 50);

    expect(projectLimitWarnings()).toHaveLength(1);
  });

  it('윈도가 바뀌면 다시 경고한다 — 지속되는 소진은 계속 보여야 한다', () => {
    exhaustProjectLimit('p1', 1);
    vi.advanceTimersByTime(60_001);
    exhaustProjectLimit('p1', 1);

    expect(projectLimitWarnings()).toHaveLength(2);
  });

  it('IP 한도 초과는 프로젝트 경고를 남기지 않는다 — 한 방문자의 과속은 오남용 신호가 아니다', () => {
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN + 5; i++) {
      checkSiteRateLimit('1.1.1.1', 'p1');
    }

    expect(projectLimitWarnings()).toHaveLength(0);
  });

  it('프로젝트마다 독립적으로 경고한다', () => {
    exhaustProjectLimit('p1', 1);
    exhaustProjectLimit('p2', 1);

    expect(projectLimitWarnings()).toHaveLength(2);
  });
});

describe('getSiteProxyStats (#200)', () => {
  beforeEach(() => {
    __resetSiteRateLimit();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    __resetSiteRateLimit();
  });

  it('프로젝트별 허용 횟수를 집계한다', async () => {
    const { getSiteProxyStats } = await import('./siteRateLimit');
    checkSiteRateLimit('1.1.1.1', 'p1');
    checkSiteRateLimit('1.1.1.1', 'p1');
    checkSiteRateLimit('1.1.1.1', 'p2');

    const stats = getSiteProxyStats();
    expect(stats.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ projectId: 'p1', allowed: 2 }),
        expect.objectContaining({ projectId: 'p2', allowed: 1 }),
      ]),
    );
  });

  it('IP 차단과 프로젝트 차단을 구분해 집계한다 — 어느 경계가 물렸는지 알아야 조정할 수 있다', async () => {
    const { getSiteProxyStats } = await import('./siteRateLimit');

    // 한 IP로 IP 한도를 넘긴다 → blockedByIp
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN + 3; i++) checkSiteRateLimit('1.1.1.1', 'p1');
    // 분산 IP로 프로젝트 한도를 넘긴다 → blockedByProject
    exhaustProjectLimit('p2', 4);

    const stats = getSiteProxyStats();
    const p1 = stats.projects.find((p) => p.projectId === 'p1')!;
    const p2 = stats.projects.find((p) => p.projectId === 'p2')!;

    expect(p1.blockedByIp).toBe(3);
    expect(p1.blockedByProject).toBe(0);
    expect(p2.blockedByProject).toBe(4);
    expect(p2.blockedByIp).toBe(0);
  });

  it('현재 한도 설정을 함께 노출한다 — 수치만 보면 조정 판단을 할 수 없다', async () => {
    const { getSiteProxyStats } = await import('./siteRateLimit');
    const stats = getSiteProxyStats();

    expect(stats.limits).toEqual({
      perIpPerMin: SITE_PROXY_RATE_LIMIT_PER_MIN,
      perProjectPerMin: SITE_PROXY_PROJECT_LIMIT_PER_MIN,
    });
  });

  it('집계는 윈도가 지나도 누적된다 — 리밋 버킷과 달리 추세를 봐야 한다', async () => {
    const { getSiteProxyStats } = await import('./siteRateLimit');
    checkSiteRateLimit('1.1.1.1', 'p1');
    vi.advanceTimersByTime(60_001);
    checkSiteRateLimit('1.1.1.1', 'p1');

    expect(getSiteProxyStats().projects.find((p) => p.projectId === 'p1')?.allowed).toBe(2);
  });

  it('용량을 넘기면 새 프로젝트는 집계하지 않고 truncated로 알린다 — 조용한 절단 금지', async () => {
    const { getSiteProxyStats } = await import('./siteRateLimit');
    for (let i = 0; i < MAX_SITE_RATE_LIMIT_BUCKETS + 10; i++) {
      checkSiteRateLimit('1.1.1.1', `p${i}`);
    }

    const stats = getSiteProxyStats();
    expect(stats.truncated).toBe(true);
    expect(stats.trackedProjects).toBeLessThanOrEqual(MAX_SITE_RATE_LIMIT_BUCKETS);
  });

  it('__resetSiteRateLimit은 집계도 초기화한다', async () => {
    const { getSiteProxyStats } = await import('./siteRateLimit');
    checkSiteRateLimit('1.1.1.1', 'p1');
    __resetSiteRateLimit();

    const stats = getSiteProxyStats();
    expect(stats.projects).toHaveLength(0);
    expect(stats.truncated).toBe(false);
  });
});
