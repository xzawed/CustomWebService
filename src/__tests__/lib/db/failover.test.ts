import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  isDbConnectionError,
  isInFailover,
  reportFailure,
  reportSuccess,
  getFailoverStatus,
  _resetFailoverState,
} from '@/lib/db/failover';

// resetDbConnection을 mock해서 실제 DB 연결을 건드리지 않음
vi.mock('@/lib/db/connection', () => ({
  resetDbConnection: vi.fn().mockResolvedValue(undefined),
}));

// logger mock
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function makeConnError(code: string, message = 'test error'): Error {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe('isDbConnectionError', () => {
  it('ECONNREFUSED → true', () => {
    expect(isDbConnectionError(makeConnError('ECONNREFUSED'))).toBe(true);
  });

  it('ETIMEDOUT → true', () => {
    expect(isDbConnectionError(makeConnError('ETIMEDOUT'))).toBe(true);
  });

  it('ENOTFOUND → true', () => {
    expect(isDbConnectionError(makeConnError('ENOTFOUND'))).toBe(true);
  });

  it('connection terminated 메시지 → true', () => {
    expect(isDbConnectionError(new Error('connection terminated unexpectedly'))).toBe(true);
  });

  it('connection timeout 메시지 → true', () => {
    expect(isDbConnectionError(new Error('connection timeout exceeded'))).toBe(true);
  });

  it('could not connect 메시지 → true', () => {
    expect(isDbConnectionError(new Error('could not connect to server'))).toBe(true);
  });

  it('too many clients 메시지 → true', () => {
    expect(isDbConnectionError(new Error('too many clients already'))).toBe(true);
  });

  it('일반 Error → false', () => {
    expect(isDbConnectionError(new Error('some random error'))).toBe(false);
  });

  it('non-Error → false', () => {
    expect(isDbConnectionError('string error')).toBe(false);
    expect(isDbConnectionError(null)).toBe(false);
    expect(isDbConnectionError({ message: 'ECONNREFUSED' })).toBe(false);
  });
});

describe('circuit breaker 상태 머신', () => {
  beforeEach(() => {
    _resetFailoverState();
    vi.stubEnv('FAILOVER_ENABLED', 'true');
    vi.stubEnv('FAILOVER_FAILURE_THRESHOLD', '3');
    vi.stubEnv('FAILOVER_FAILURE_WINDOW_MS', '30000');
  });

  afterEach(() => {
    _resetFailoverState();
    vi.unstubAllEnvs();
  });

  it('초기 상태는 normal', () => {
    expect(isInFailover()).toBe(false);
    expect(getFailoverStatus().state).toBe('normal');
  });

  it('threshold 미만 실패 → NORMAL 유지', () => {
    const err = makeConnError('ECONNREFUSED');
    reportFailure(err);
    reportFailure(err);
    expect(isInFailover()).toBe(false);
    expect(getFailoverStatus().consecutiveFailures).toBe(2);
  });

  it('threshold 도달 → TRIPPED로 전환', async () => {
    const err = makeConnError('ECONNREFUSED');
    reportFailure(err);
    reportFailure(err);
    reportFailure(err); // threshold=3 도달
    // tripCircuit은 async지만 상태 전환은 동기적으로 발생
    expect(isInFailover()).toBe(true);
    expect(getFailoverStatus().state).toBe('tripped');
    expect(getFailoverStatus().lastTripTime).not.toBeNull();
  });

  it('이미 TRIPPED 상태에서 추가 실패 → 무시 (중복 전환 없음)', () => {
    const err = makeConnError('ECONNREFUSED');
    reportFailure(err);
    reportFailure(err);
    reportFailure(err); // trip
    const tripTime = getFailoverStatus().lastTripTime;
    reportFailure(err); // 무시되어야 함
    expect(getFailoverStatus().lastTripTime).toBe(tripTime); // tripTime 변경 없음
  });

  it('FAILOVER_ENABLED=false → 실패 보고 무시', () => {
    vi.stubEnv('FAILOVER_ENABLED', 'false');
    const err = makeConnError('ECONNREFUSED');
    reportFailure(err);
    reportFailure(err);
    reportFailure(err);
    expect(isInFailover()).toBe(false);
    expect(getFailoverStatus().consecutiveFailures).toBe(0);
  });

  it('DB 연결 에러가 아닌 에러 → 카운터 증가 없음', () => {
    reportFailure(new Error('some unrelated error'));
    expect(getFailoverStatus().consecutiveFailures).toBe(0);
  });

  it('윈도우 밖 실패 → 카운터 리셋 후 새 카운팅', () => {
    vi.stubEnv('FAILOVER_FAILURE_WINDOW_MS', '100'); // 100ms 윈도우
    const err = makeConnError('ECONNREFUSED');
    reportFailure(err); // count=1, firstFailureTime=now

    // 100ms 이상 경과 시뮬레이션
    vi.setSystemTime(Date.now() + 200);
    reportFailure(err); // 윈도우 밖 → 리셋 후 count=1

    expect(getFailoverStatus().consecutiveFailures).toBe(1);
    vi.useRealTimers();
  });

  it('reportSuccess → NORMAL 상태에서 카운터 리셋', () => {
    const err = makeConnError('ECONNREFUSED');
    reportFailure(err);
    reportFailure(err);
    expect(getFailoverStatus().consecutiveFailures).toBe(2);

    reportSuccess();
    expect(getFailoverStatus().consecutiveFailures).toBe(0);
    expect(isInFailover()).toBe(false);
  });

  it('getFailoverStatus → 올바른 상태 반환', () => {
    const status = getFailoverStatus();
    expect(status).toHaveProperty('state', 'normal');
    expect(status).toHaveProperty('consecutiveFailures', 0);
    expect(status).toHaveProperty('lastTripTime', null);
    expect(status).toHaveProperty('enabled', true);
  });
});
