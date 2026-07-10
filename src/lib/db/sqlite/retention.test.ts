import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { logger } from '@/lib/utils/logger';
import {
  getRetentionConfig,
  isoCutoff,
  localDateCutoff,
  pruneOnce,
  scheduleRetention,
  type RetentionConfig,
} from './retention';

const DAY_MS = 86_400_000;
const NOW = new Date('2026-07-10T12:00:00.000Z');

function ago(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

/** 로컬 날짜 문자열(YYYY-MM-DD) — user_daily_limits.usage_date와 동일 규칙. */
function localDateAgo(days: number): string {
  const d = new Date(NOW.getTime() - days * DAY_MS);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const CONFIG: RetentionConfig = {
  enabled: true,
  intervalMs: DAY_MS,
  eventDays: 90,
  authTokenDays: 7,
  dailyLimitDays: 30,
};

/** 보존 정책이 건드리는 3개 테이블만 최소 스키마로 만든다(FK 없이 독립). */
function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE platform_events (id TEXT PRIMARY KEY, type TEXT, created_at TEXT);
    CREATE TABLE auth_tokens (
      id TEXT PRIMARY KEY, user_id TEXT, token_hash TEXT, type TEXT,
      expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT
    );
    CREATE TABLE user_daily_limits (
      user_id TEXT, usage_date TEXT, generation_count INTEGER, deploy_count INTEGER,
      PRIMARY KEY (user_id, usage_date)
    );
  `);
  return db;
}

function insertEvent(db: Database.Database, id: string, createdAt: string): void {
  db.prepare('INSERT INTO platform_events (id, type, created_at) VALUES (?, ?, ?)').run(
    id,
    'TEST',
    createdAt
  );
}

function insertToken(
  db: Database.Database,
  id: string,
  expiresAt: string,
  consumedAt: string | null
): void {
  db.prepare(
    'INSERT INTO auth_tokens (id, user_id, token_hash, type, expires_at, consumed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, 'u1', `hash-${id}`, 'email_verify', expiresAt, consumedAt, ago(365));
}

function insertLimit(db: Database.Database, usageDate: string): void {
  db.prepare(
    'INSERT INTO user_daily_limits (user_id, usage_date, generation_count, deploy_count) VALUES (?, ?, ?, ?)'
  ).run('u1', usageDate, 1, 0);
}

const ids = (db: Database.Database, table: string): string[] =>
  db
    .prepare(`SELECT id FROM ${table} ORDER BY id`)
    .all()
    .map((r) => (r as { id: string }).id);

describe('isoCutoff', () => {
  it('now - days를 ISO(UTC) 문자열로 반환한다', () => {
    expect(isoCutoff(NOW, 7)).toBe('2026-07-03T12:00:00.000Z');
  });

  it('사전식 비교가 시간 비교와 일치한다', () => {
    expect(ago(8) < isoCutoff(NOW, 7)).toBe(true);
    expect(ago(6) < isoCutoff(NOW, 7)).toBe(false);
  });
});

describe('localDateCutoff', () => {
  it('now - days를 로컬 YYYY-MM-DD로 반환한다', () => {
    expect(localDateCutoff(NOW, 30)).toBe(localDateAgo(30));
  });

  it('0일이면 오늘 로컬 날짜를 반환한다 (오늘 카운터는 cutoff 미만이 아니라 보존됨)', () => {
    const today = localDateCutoff(NOW, 0);
    expect(today < today).toBe(false);
  });
});

describe('getRetentionConfig', () => {
  it('기본값을 반환한다', () => {
    expect(getRetentionConfig({})).toEqual({
      enabled: true,
      intervalMs: DAY_MS,
      eventDays: 90,
      authTokenDays: 7,
      dailyLimitDays: 30,
    });
  });

  it('DB_RETENTION_ENABLED=false 이면 비활성', () => {
    expect(getRetentionConfig({ DB_RETENTION_ENABLED: 'false' }).enabled).toBe(false);
  });

  it('환경변수 값을 반영한다', () => {
    const cfg = getRetentionConfig({
      EVENT_RETENTION_DAYS: '30',
      AUTH_TOKEN_RETENTION_DAYS: '3',
      DAILY_LIMIT_RETENTION_DAYS: '10',
      DB_RETENTION_INTERVAL_MS: '1000',
    });
    expect(cfg.eventDays).toBe(30);
    expect(cfg.authTokenDays).toBe(3);
    expect(cfg.dailyLimitDays).toBe(10);
    expect(cfg.intervalMs).toBe(1000);
  });

  it('0·음수·비수치는 기본값으로 폴백한다 (전체 삭제 사고 방지)', () => {
    expect(getRetentionConfig({ EVENT_RETENTION_DAYS: '0' }).eventDays).toBe(90);
    expect(getRetentionConfig({ EVENT_RETENTION_DAYS: '-5' }).eventDays).toBe(90);
    expect(getRetentionConfig({ EVENT_RETENTION_DAYS: 'abc' }).eventDays).toBe(90);
    expect(getRetentionConfig({ EVENT_RETENTION_DAYS: '1.5' }).eventDays).toBe(90);
  });
});

describe('pruneOnce', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it('보존 기간보다 오래된 platform_events만 삭제한다', () => {
    insertEvent(db, 'old', ago(91));
    insertEvent(db, 'edge', ago(90)); // 경계: cutoff와 동일 → `<` 이므로 보존
    insertEvent(db, 'recent', ago(1));

    const r = pruneOnce(db, CONFIG, NOW);

    expect(r.events).toBe(1);
    expect(ids(db, 'platform_events')).toEqual(['edge', 'recent']);
  });

  it('만료된 지 오래된 토큰과 오래 전 사용된 토큰을 삭제한다', () => {
    insertToken(db, 'expired-old', ago(8), null);
    insertToken(db, 'consumed-old', ago(-30), ago(8)); // 아직 유효기간이나 이미 사용됨
    const r = pruneOnce(db, CONFIG, NOW);

    expect(r.authTokens).toBe(2);
    expect(ids(db, 'auth_tokens')).toEqual([]);
  });

  it('유효한 미사용 토큰은 아무리 오래돼도 삭제하지 않는다 (인증 링크 사망 방지)', () => {
    // created_at은 1년 전이지만 만료되지 않았고 사용되지도 않았다.
    insertToken(db, 'valid', ago(-1), null);
    const r = pruneOnce(db, CONFIG, NOW);

    expect(r.authTokens).toBe(0);
    expect(ids(db, 'auth_tokens')).toEqual(['valid']);
  });

  it('최근 만료·최근 사용 토큰은 유예 기간 동안 보존한다', () => {
    insertToken(db, 'expired-recent', ago(1), null);
    insertToken(db, 'consumed-recent', ago(-30), ago(1));
    const r = pruneOnce(db, CONFIG, NOW);

    expect(r.authTokens).toBe(0);
    expect(ids(db, 'auth_tokens')).toEqual(['consumed-recent', 'expired-recent']);
  });

  it('오래된 user_daily_limits만 삭제하고 오늘 카운터는 보존한다', () => {
    insertLimit(db, localDateAgo(31));
    insertLimit(db, localDateAgo(30)); // 경계 → 보존
    insertLimit(db, localDateAgo(0)); // 오늘

    const r = pruneOnce(db, CONFIG, NOW);

    expect(r.dailyLimits).toBe(1);
    const rows = db
      .prepare('SELECT usage_date FROM user_daily_limits ORDER BY usage_date')
      .all()
      .map((x) => (x as { usage_date: string }).usage_date);
    expect(rows).toEqual([localDateAgo(30), localDateAgo(0)].sort((a, b) => a.localeCompare(b)));
  });

  it('삭제 대상이 없으면 0을 반환하고 아무것도 지우지 않는다', () => {
    insertEvent(db, 'recent', ago(1));
    insertToken(db, 'valid', ago(-1), null);
    insertLimit(db, localDateAgo(0));

    expect(pruneOnce(db, CONFIG, NOW)).toEqual({ events: 0, authTokens: 0, dailyLimits: 0 });
    expect(ids(db, 'platform_events')).toEqual(['recent']);
    expect(ids(db, 'auth_tokens')).toEqual(['valid']);
  });

  it('한 트랜잭션으로 묶여 실패 시 부분 삭제가 남지 않는다', () => {
    insertEvent(db, 'old', ago(91));
    db.exec('DROP TABLE user_daily_limits'); // 마지막 DELETE에서 실패 유도

    expect(() => pruneOnce(db, CONFIG, NOW)).toThrow();
    // 앞선 platform_events DELETE가 롤백되어야 한다.
    expect(ids(db, 'platform_events')).toEqual(['old']);
  });
});

describe('scheduleRetention', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    db.close();
  });

  it('비활성이면 아무것도 하지 않는다', () => {
    const pruneFn = vi.fn();
    const stop = scheduleRetention(db, { ...CONFIG, enabled: false }, { pruneFn });

    expect(pruneFn).not.toHaveBeenCalled();
    stop();
  });

  it('부팅 직후 즉시 1회 실행하고 주기 타이머를 건다', () => {
    const pruneFn = vi.fn().mockReturnValue({ events: 2, authTokens: 0, dailyLimits: 0 });
    const setIntervalFn = vi.fn().mockReturnValue('handle');
    const clearIntervalFn = vi.fn();

    const stop = scheduleRetention(db, CONFIG, {
      pruneFn,
      setIntervalFn,
      clearIntervalFn,
      now: () => NOW,
    });

    expect(pruneFn).toHaveBeenCalledTimes(1);
    expect(pruneFn).toHaveBeenCalledWith(db, CONFIG, NOW);
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), CONFIG.intervalMs);

    stop();
    expect(clearIntervalFn).toHaveBeenCalledWith('handle');
  });

  it('삭제된 행이 있을 때만 로그를 남긴다', () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    scheduleRetention(db, CONFIG, {
      pruneFn: vi.fn().mockReturnValue({ events: 0, authTokens: 0, dailyLimits: 0 }),
      setIntervalFn: () => 'h',
      clearIntervalFn: () => {},
    });
    expect(infoSpy).not.toHaveBeenCalled();

    scheduleRetention(db, CONFIG, {
      pruneFn: vi.fn().mockReturnValue({ events: 3, authTokens: 0, dailyLimits: 0 }),
      setIntervalFn: () => 'h',
      clearIntervalFn: () => {},
    });
    expect(infoSpy).toHaveBeenCalledWith('DB retention pruned', {
      events: 3,
      authTokens: 0,
      dailyLimits: 0,
    });
  });

  it('타이머를 주입하지 않으면 실제 setInterval을 쓰고 unref()로 종료를 막지 않는다', () => {
    // 기본 주입값(setIntervalFn/clearIntervalFn) 경로 — 프로덕션이 실제로 타는 코드다.
    const probe = setInterval(() => {}, 3_600_000);
    const timerProto = Object.getPrototypeOf(probe) as { unref: () => unknown };
    clearInterval(probe);

    const unrefSpy = vi.spyOn(timerProto, 'unref');
    const pruneFn = vi.fn().mockReturnValue({ events: 0, authTokens: 0, dailyLimits: 0 });

    const stop = scheduleRetention(db, { ...CONFIG, intervalMs: 3_600_000 }, { pruneFn });

    expect(pruneFn).toHaveBeenCalledTimes(1); // 부팅 직후 즉시 1회
    expect(unrefSpy).toHaveBeenCalled(); // 타이머가 프로세스 종료를 막지 않는다

    stop(); // 기본 clearIntervalFn 경로 — 타이머 정리
    unrefSpy.mockRestore();
  });

  it('now를 주입하지 않으면 실제 시각을 사용한다 (기본 주입값 경로)', () => {
    const pruneFn = vi.fn().mockReturnValue({ events: 0, authTokens: 0, dailyLimits: 0 });
    const stop = scheduleRetention(db, CONFIG, {
      pruneFn,
      setIntervalFn: () => 'h',
      clearIntervalFn: () => {},
    });

    expect(pruneFn).toHaveBeenCalledTimes(1);
    const passedNow = pruneFn.mock.calls[0]![2] as Date;
    expect(passedNow).toBeInstanceOf(Date);
    stop();
  });

  it('정리 실패는 삼켜지고 에러 로그만 남긴다 (부팅을 막지 않음)', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    expect(() =>
      scheduleRetention(db, CONFIG, {
        pruneFn: vi.fn().mockImplementation(() => {
          throw new Error('boom');
        }),
        setIntervalFn: () => 'h',
        clearIntervalFn: () => {},
      })
    ).not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith('DB retention failed', { error: 'boom' });
  });
});
