import { Client } from 'pg';
import { resetDbConnection } from '@/lib/db/connection';
import { logger } from '@/lib/utils/logger';

type FailoverState = 'normal' | 'tripped';

interface FailoverConfig {
  enabled: boolean;
  failureThreshold: number;
  failureWindowMs: number;
  recoveryIntervalMs: number;
  recoveryThreshold: number;
  minDurationMs: number;
}

// --- 모듈 상태 ---
let _state: FailoverState = 'normal';
let _consecutiveFailures = 0;
let _firstFailureTime: number | null = null;
let _lastTripTime: number | null = null;
let _consecutiveRecoverySuccesses = 0;
let _recoveryInterval: ReturnType<typeof setInterval> | null = null;

function getConfig(): FailoverConfig {
  return {
    enabled: process.env.FAILOVER_ENABLED !== 'false',
    failureThreshold: Number(process.env.FAILOVER_FAILURE_THRESHOLD) || 3,
    failureWindowMs: Number(process.env.FAILOVER_FAILURE_WINDOW_MS) || 30_000,
    recoveryIntervalMs: Number(process.env.FAILOVER_RECOVERY_INTERVAL_MS) || 30_000,
    recoveryThreshold: Number(process.env.FAILOVER_RECOVERY_THRESHOLD) || 2,
    minDurationMs: Number(process.env.FAILOVER_MIN_DURATION_MS) || 60_000,
  };
}

/** failover 활성 여부 */
export function isInFailover(): boolean {
  return _state === 'tripped';
}

/** 상태 정보 (health 엔드포인트용) */
export function getFailoverStatus(): {
  state: FailoverState;
  consecutiveFailures: number;
  lastTripTime: string | null;
  enabled: boolean;
} {
  return {
    state: _state,
    consecutiveFailures: _consecutiveFailures,
    lastTripTime: _lastTripTime ? new Date(_lastTripTime).toISOString() : null,
    enabled: getConfig().enabled,
  };
}

/** DB 연결 에러인지 판별 */
export function isDbConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const code = (error as NodeJS.ErrnoException).code ?? '';
  return (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    msg.includes('connection terminated') ||
    msg.includes('connection timeout') ||
    msg.includes('the database system is shutting down') ||
    msg.includes('too many clients') ||
    msg.includes('could not connect')
  );
}

/**
 * 실패 보고 — circuit breaker 로직
 * 성공 카운터 리셋은 `failureWindowMs` 경과로만 수행됨 (별도 reportSuccess 없음)
 */
export function reportFailure(error: unknown): void {
  const config = getConfig();
  if (!config.enabled || _state === 'tripped') return;
  if (!isDbConnectionError(error)) return;

  const now = Date.now();

  // 윈도우 밖의 실패면 카운터 리셋
  if (_firstFailureTime && now - _firstFailureTime > config.failureWindowMs) {
    _consecutiveFailures = 0;
    _firstFailureTime = null;
  }

  if (!_firstFailureTime) _firstFailureTime = now;
  _consecutiveFailures++;

  logger.warn('DB connection failure detected', {
    consecutiveFailures: _consecutiveFailures,
    threshold: config.failureThreshold,
  });

  if (_consecutiveFailures >= config.failureThreshold) {
    void tripCircuit();
  }
}

/** circuit trip → Supabase로 전환 */
async function tripCircuit(): Promise<void> {
  _state = 'tripped';
  _lastTripTime = Date.now();
  _consecutiveFailures = 0;
  _firstFailureTime = null;

  logger.error('FAILOVER ACTIVATED: postgres → supabase', {
    tripTime: new Date(_lastTripTime).toISOString(),
  });

  await resetDbConnection();
  startRecoveryProbe();
}

/** 복구 프로브 — postgres 접속 시도 */
function startRecoveryProbe(): void {
  if (_recoveryInterval) return;
  const config = getConfig();
  _consecutiveRecoverySuccesses = 0;

  _recoveryInterval = setInterval(() => {
    void runRecoveryProbe(config);
  }, config.recoveryIntervalMs);
}

async function runRecoveryProbe(config: FailoverConfig): Promise<void> {
  // 최소 유지 시간 체크
  if (_lastTripTime && Date.now() - _lastTripTime < config.minDurationMs) return;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;

  const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();

    _consecutiveRecoverySuccesses++;
    logger.info('Recovery probe success', {
      consecutiveSuccesses: _consecutiveRecoverySuccesses,
      threshold: config.recoveryThreshold,
    });

    if (_consecutiveRecoverySuccesses >= config.recoveryThreshold) {
      recoverCircuit();
    }
  } catch {
    _consecutiveRecoverySuccesses = 0;
    await client.end().catch(() => {});
  }
}

/** circuit 복구 → postgres로 복귀 */
function recoverCircuit(): void {
  _state = 'normal';
  _consecutiveRecoverySuccesses = 0;

  if (_recoveryInterval) {
    clearInterval(_recoveryInterval);
    _recoveryInterval = null;
  }

  logger.info('FAILOVER RECOVERED: supabase → postgres', {
    downtime: _lastTripTime ? `${Math.round((Date.now() - _lastTripTime) / 1000)}s` : 'unknown',
  });
}

/**
 * 테스트 전용: failover 상태를 초기화합니다.
 * 프로덕션 코드에서 호출하지 마세요.
 */
export function _resetFailoverState(): void {
  _state = 'normal';
  _consecutiveFailures = 0;
  _firstFailureTime = null;
  _lastTripTime = null;
  _consecutiveRecoverySuccesses = 0;
  if (_recoveryInterval) {
    clearInterval(_recoveryInterval);
    _recoveryInterval = null;
  }
}
