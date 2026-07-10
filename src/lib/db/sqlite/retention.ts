import type Database from 'better-sqlite3';
import { logger } from '@/lib/utils/logger';

/**
 * 무한 증가 테이블 보존 정책.
 *
 * `generated_codes`만 `pruneOldVersions()`로 정리되고, 나머지 세 테이블은 삭제 경로가 전혀 없어
 * 임베디드 SQLite 파일이 단조 증가했다. 특히 `platform_events`는 EventBus의 **모든** 도메인 이벤트를
 * 기록하므로 트래픽에 선형 비례해 커진다.
 *
 * 단일 인스턴스(Railway 볼륨) 전제이며, 백업 스케줄러(`backup.ts`)와 동일한 방식으로 배선된다.
 * 삭제는 되돌릴 수 없으므로 기본값을 넉넉히 잡고, 유효한 데이터는 어떤 경우에도 지우지 않는다.
 */

const DAY_MS = 86_400_000;

const DEFAULT_INTERVAL_MS = DAY_MS; // 24h
const DEFAULT_EVENT_DAYS = 90;
const DEFAULT_AUTH_TOKEN_DAYS = 7;
const DEFAULT_DAILY_LIMIT_DAYS = 30;

export interface RetentionConfig {
  /** 보존 정책 스케줄러 활성 여부 (`DB_RETENTION_ENABLED !== 'false'`). */
  enabled: boolean;
  /** 정리 주기(ms). */
  intervalMs: number;
  /** `platform_events` 보존 일수. 이보다 오래된 이벤트를 삭제한다. */
  eventDays: number;
  /** `auth_tokens` 보존 일수. **만료됐거나 이미 사용된** 토큰만 이 기간 이후 삭제한다. */
  authTokenDays: number;
  /** `user_daily_limits` 보존 일수. 오늘 카운터만 의미가 있으나 감사 여유를 둔다. */
  dailyLimitDays: number;
}

/**
 * `interface`가 아니라 `type`인 이유: interface는 암묵적 인덱스 시그니처가 없어
 * `logger.info(msg, context: Record<string, unknown>)`에 그대로 넘길 수 없다.
 */
export type RetentionResult = {
  events: number;
  authTokens: number;
  dailyLimits: number;
};

function envInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** 환경변수에서 보존 설정을 읽는다(잘못된 값은 안전한 기본값으로 폴백). */
export function getRetentionConfig(
  env: Record<string, string | undefined> = process.env
): RetentionConfig {
  return {
    enabled: env.DB_RETENTION_ENABLED !== 'false',
    intervalMs: envInt(env.DB_RETENTION_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    eventDays: envInt(env.EVENT_RETENTION_DAYS, DEFAULT_EVENT_DAYS),
    authTokenDays: envInt(env.AUTH_TOKEN_RETENTION_DAYS, DEFAULT_AUTH_TOKEN_DAYS),
    dailyLimitDays: envInt(env.DAILY_LIMIT_RETENTION_DAYS, DEFAULT_DAILY_LIMIT_DAYS),
  };
}

/**
 * `now - days` 를 ISO 문자열(UTC)로. `created_at`·`expires_at`·`consumed_at`은 모두
 * `new Date().toISOString()` 으로 기록되므로 사전식 비교가 곧 시간 비교다.
 */
export function isoCutoff(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

/**
 * `now - days` 를 **로컬** `YYYY-MM-DD` 로. `user_daily_limits.usage_date`는
 * `SqliteRateLimitRepository.today()`가 로컬 날짜 문자열로 기록하므로 동일 기준을 써야 한다.
 * (UTC 기준으로 자르면 타임존에 따라 오늘 카운터를 지울 수 있다.)
 */
export function localDateCutoff(now: Date, days: number): string {
  const d = new Date(now.getTime() - days * DAY_MS);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 보존 정책을 1회 적용한다. 세 DELETE를 하나의 동기 트랜잭션으로 묶어 부분 적용을 방지한다.
 *
 * 안전 규칙:
 * - `auth_tokens`는 `expires_at`이 지난(=이미 사용 불가) 토큰과 `consumed_at`이 찍힌 토큰만 삭제한다.
 *   **유효한 미사용 토큰은 아무리 오래돼도 지우지 않는다** — 삭제하면 사용자의 이메일 인증·비밀번호
 *   재설정 링크가 조용히 죽는다.
 * - `usage_date` 비교는 로컬 날짜 기준(`localDateCutoff`)이라 오늘 카운터가 지워지지 않는다.
 */
export function pruneOnce(
  raw: Database.Database,
  config: RetentionConfig,
  now: Date = new Date()
): RetentionResult {
  const eventCutoff = isoCutoff(now, config.eventDays);
  const tokenCutoff = isoCutoff(now, config.authTokenDays);
  const limitCutoff = localDateCutoff(now, config.dailyLimitDays);

  const tx = raw.transaction((): RetentionResult => {
    const events = raw
      .prepare('DELETE FROM platform_events WHERE created_at < ?')
      .run(eventCutoff).changes;

    const authTokens = raw
      .prepare(
        'DELETE FROM auth_tokens WHERE expires_at < ? OR (consumed_at IS NOT NULL AND consumed_at < ?)'
      )
      .run(tokenCutoff, tokenCutoff).changes;

    const dailyLimits = raw
      .prepare('DELETE FROM user_daily_limits WHERE usage_date < ?')
      .run(limitCutoff).changes;

    return { events, authTokens, dailyLimits };
  });

  return tx();
}

interface ScheduleDeps {
  pruneFn?: typeof pruneOnce;
  /** 테스트 주입용. 핸들 타입은 의도적으로 느슨하게(`unknown`) 둔다(DOM/Node `setInterval` 오버로드 회피). */
  setIntervalFn?: (callback: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  now?: () => Date;
}

/**
 * 주기 정리를 시작한다(부팅 시 즉시 1회 + 이후 `intervalMs` 간격). 비활성이면 no-op.
 * 타이머는 `unref()`하여 프로세스 종료를 막지 않는다. 반환된 함수를 호출하면 스케줄을 중단한다.
 */
export function scheduleRetention(
  raw: Database.Database,
  config: RetentionConfig,
  deps: ScheduleDeps = {}
): () => void {
  const {
    pruneFn = pruneOnce,
    setIntervalFn = (cb: () => void, ms: number): unknown => setInterval(cb, ms),
    clearIntervalFn = (handle: unknown): void =>
      clearInterval(handle as ReturnType<typeof setInterval>),
    now = (): Date => new Date(),
  } = deps;

  if (!config.enabled) return () => {};

  const tick = (): void => {
    try {
      const r = pruneFn(raw, config, now());
      if (r.events || r.authTokens || r.dailyLimits) {
        logger.info('DB retention pruned', r);
      }
    } catch (err: unknown) {
      logger.error('DB retention failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handle = setIntervalFn(tick, config.intervalMs);
  const timer = handle as { unref?: () => void };
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  tick(); // 부팅 직후 즉시 1회

  return () => clearIntervalFn(handle);
}
