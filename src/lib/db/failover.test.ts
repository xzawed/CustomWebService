/**
 * src/lib/db/failover.ts — co-located 단위 테스트
 *
 * 기존 `src/__tests__/lib/db/failover.test.ts` 와 별도로 co-located 위치에 배치.
 * 두 파일이 동일 모듈 상태를 공유하므로 vi.resetModules()로 격리할 필요가 없음.
 * (각 describe block에서 beforeEach로 _resetFailoverState 호출)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isInFailover,
  isDbConnectionError,
  reportFailure,
  _resetFailoverState,
  getFailoverStatus,
} from './failover';

// tripCircuit이 호출하는 resetDbConnection mock
vi.mock('@/lib/db/connection', () => ({
  resetDbConnection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// ───────────────────────────────────────────────
// 헬퍼
// ───────────────────────────────────────────────
function makeConnError(code: string, message = 'db error'): Error {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

// ───────────────────────────────────────────────
// isInFailover
// ───────────────────────────────────────────────
describe('isInFailover()', () => {
  beforeEach(() => {
    _resetFailoverState();
  });

  it('초기 상태는 false (normal)', () => {
    expect(isInFailover()).toBe(false);
  });
});

// ───────────────────────────────────────────────
// isDbConnectionError
// ───────────────────────────────────────────────
describe('isDbConnectionError()', () => {
  it('ECONNREFUSED 코드 → true', () => {
    expect(isDbConnectionError(makeConnError('ECONNREFUSED'))).toBe(true);
  });

  it('ETIMEDOUT 코드 → true', () => {
    expect(isDbConnectionError(makeConnError('ETIMEDOUT'))).toBe(true);
  });

  it('ENOTFOUND 코드 → true', () => {
    expect(isDbConnectionError(makeConnError('ENOTFOUND'))).toBe(true);
  });

  it('"connection terminated" 메시지 → true', () => {
    expect(isDbConnectionError(new Error('connection terminated unexpectedly'))).toBe(true);
  });

  it('"connection timeout" 메시지 → true', () => {
    expect(isDbConnectionError(new Error('connection timeout exceeded'))).toBe(true);
  });

  it('"too many clients" 메시지 → true', () => {
    expect(isDbConnectionError(new Error('too many clients already'))).toBe(true);
  });

  it('"could not connect" 메시지 → true', () => {
    expect(isDbConnectionError(new Error('could not connect to server'))).toBe(true);
  });

  it('일반 에러("SyntaxError") → false', () => {
    expect(isDbConnectionError(new Error('SyntaxError: unexpected token'))).toBe(false);
  });

  it('Error 아닌 string → false', () => {
    expect(isDbConnectionError('ECONNREFUSED')).toBe(false);
  });

  it('Error 아닌 number → false', () => {
    expect(isDbConnectionError(42)).toBe(false);
  });

  it('Error 아닌 plain object → false', () => {
    expect(isDbConnectionError({ message: 'ECONNREFUSED', code: 'ECONNREFUSED' })).toBe(false);
  });
});

// ───────────────────────────────────────────────
// reportFailure
// ───────────────────────────────────────────────
describe('reportFailure()', () => {
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

  it('DB 연결 에러가 아닌 경우 카운터가 증가하지 않는다', () => {
    reportFailure(new Error('unrelated error'));
    expect(getFailoverStatus().consecutiveFailures).toBe(0);
  });

  it('FAILOVER_ENABLED=false → 실패 무시', () => {
    vi.stubEnv('FAILOVER_ENABLED', 'false');
    reportFailure(makeConnError('ECONNREFUSED'));
    reportFailure(makeConnError('ECONNREFUSED'));
    reportFailure(makeConnError('ECONNREFUSED'));
    expect(isInFailover()).toBe(false);
    expect(getFailoverStatus().consecutiveFailures).toBe(0);
  });

  it('이미 tripped 상태에서 추가 실패 → 무시', () => {
    const err = makeConnError('ECONNREFUSED');
    reportFailure(err);
    reportFailure(err);
    reportFailure(err); // trip
    const tripTime = getFailoverStatus().lastTripTime;
    reportFailure(err);
    expect(getFailoverStatus().lastTripTime).toBe(tripTime);
  });

  it('threshold 미만 실패 → 아직 tripped 아님', () => {
    const err = makeConnError('ECONNREFUSED');
    reportFailure(err); // 1
    reportFailure(err); // 2
    expect(isInFailover()).toBe(false);
    expect(getFailoverStatus().consecutiveFailures).toBe(2);
  });

  it('threshold(3) 달성 시 → isInFailover() true', () => {
    const err = makeConnError('ECONNREFUSED');
    reportFailure(err); // 1
    reportFailure(err); // 2
    reportFailure(err); // 3 → trip
    expect(isInFailover()).toBe(true);
    expect(getFailoverStatus().state).toBe('tripped');
  });

  it('failureWindowMs 초과 후 실패 → 카운터 리셋 후 1로 시작', () => {
    vi.stubEnv('FAILOVER_FAILURE_WINDOW_MS', '100'); // 100ms 윈도우
    vi.useFakeTimers();
    try {
      const err = makeConnError('ECONNREFUSED');
      reportFailure(err); // count=1

      // 200ms 경과 → 윈도우 밖
      vi.advanceTimersByTime(200);
      reportFailure(err); // 리셋 후 count=1

      expect(getFailoverStatus().consecutiveFailures).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ───────────────────────────────────────────────
// getFailoverStatus
// ───────────────────────────────────────────────
describe('getFailoverStatus()', () => {
  beforeEach(() => {
    _resetFailoverState();
    vi.stubEnv('FAILOVER_ENABLED', 'true');
  });

  afterEach(() => {
    _resetFailoverState();
    vi.unstubAllEnvs();
  });

  it('초기 상태를 올바르게 반환한다', () => {
    const status = getFailoverStatus();
    expect(status.state).toBe('normal');
    expect(status.consecutiveFailures).toBe(0);
    expect(status.lastTripTime).toBeNull();
    expect(status.enabled).toBe(true);
  });
});
