import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SlackAlertOptions } from '@/lib/monitoring/slackAlert';
import { logger } from '@/lib/utils/logger';
import {
  formatBackupTimestamp,
  selectBackupsToPrune,
  selectLatestBackupFilename,
  listBackupFilenames,
  getBackupConfig,
  runBackup,
  scheduleBackups,
  createOffsiteSink,
  NoopOffsiteSink,
  HttpsPutOffsiteSink,
  getOffsiteBackupStatus,
  resetOffsiteBackupStatusForTests,
  sha256File,
  BACKUP_FILE_REGEX,
  type OffsiteBackupSink,
  type OffsiteBackupMeta,
} from './backup';

describe('formatBackupTimestamp', () => {
  it('formats a Date as app-YYYYMMDD-HHmmss in UTC', () => {
    const d = new Date(Date.UTC(2026, 5, 25, 14, 5, 9)); // 2026-06-25 14:05:09 UTC
    expect(formatBackupTimestamp(d)).toBe('20260625-140509');
  });

  it('zero-pads month, day, hour, minute, second', () => {
    const d = new Date(Date.UTC(2026, 0, 1, 0, 0, 0)); // 2026-01-01 00:00:00 UTC
    expect(formatBackupTimestamp(d)).toBe('20260101-000000');
  });

  it('produces a string matched by the backup file regex when wrapped', () => {
    const d = new Date(Date.UTC(2026, 11, 31, 23, 59, 59));
    expect(`app-${formatBackupTimestamp(d)}.db`).toMatch(BACKUP_FILE_REGEX);
  });
});

describe('listBackupFilenames / selectLatestBackupFilename / selectBackupsToPrune', () => {
  const mk = (ts: string): string => `app-${ts}.db`;

  it('listBackupFilenames keeps only the strict backup pattern, sorted', () => {
    const files = [
      'app.db',
      'app.db-wal',
      'app-20260625-100000.db-shm',
      mk('20260625-120000'),
      mk('20260625-100000'),
      'evil.db',
    ];
    expect(listBackupFilenames(files)).toEqual([mk('20260625-100000'), mk('20260625-120000')]);
  });

  it('selectLatestBackupFilename returns the newest match or null', () => {
    expect(selectLatestBackupFilename([])).toBeNull();
    expect(
      selectLatestBackupFilename([mk('20260625-100000'), 'app.db', mk('20260625-130000')])
    ).toBe(mk('20260625-130000'));
  });

  it('returns the oldest files beyond the retention count', () => {
    const files = [
      mk('20260625-100000'),
      mk('20260625-110000'),
      mk('20260625-120000'),
      mk('20260625-130000'),
    ];
    // retention 2 → keep 2 newest (12:00, 13:00), prune 2 oldest
    expect(selectBackupsToPrune(files, 2)).toEqual([
      mk('20260625-100000'),
      mk('20260625-110000'),
    ]);
  });

  it('returns [] when file count is within retention', () => {
    const files = [mk('20260625-100000'), mk('20260625-110000')];
    expect(selectBackupsToPrune(files, 7)).toEqual([]);
  });

  it('ignores files that do not match the backup pattern (never prunes the live DB or WAL)', () => {
    const files = [
      'app.db',
      'app.db-wal',
      'app.db-shm',
      'notes.txt',
      mk('20260625-100000'),
      mk('20260625-110000'),
    ];
    // only the 2 real backups are candidates; retention 1 → prune the oldest backup only
    expect(selectBackupsToPrune(files, 1)).toEqual([mk('20260625-100000')]);
  });

  it('is order-independent (sorts by timestamp regardless of input order)', () => {
    const files = [mk('20260625-130000'), mk('20260625-100000'), mk('20260625-120000')];
    expect(selectBackupsToPrune(files, 1)).toEqual([
      mk('20260625-100000'),
      mk('20260625-120000'),
    ]);
  });
});

describe('getBackupConfig', () => {
  it('uses safe defaults when no env vars are set', () => {
    const cfg = getBackupConfig({}, '/data/app.db');
    expect(cfg.enabled).toBe(true);
    expect(cfg.intervalMs).toBe(86_400_000);
    expect(cfg.retention).toBe(7);
    expect(cfg.dir).toBe(join('/data', 'backups'));
  });

  it('disables only when SQLITE_BACKUP_ENABLED is exactly "false"', () => {
    expect(getBackupConfig({ SQLITE_BACKUP_ENABLED: 'false' }, '/data/app.db').enabled).toBe(false);
    expect(getBackupConfig({ SQLITE_BACKUP_ENABLED: 'true' }, '/data/app.db').enabled).toBe(true);
  });

  it('honors interval, retention, and dir overrides', () => {
    const cfg = getBackupConfig(
      {
        SQLITE_BACKUP_INTERVAL_MS: '3600000',
        SQLITE_BACKUP_RETENTION: '3',
        SQLITE_BACKUP_DIR: '/mnt/backups',
      },
      '/data/app.db'
    );
    expect(cfg.intervalMs).toBe(3_600_000);
    expect(cfg.retention).toBe(3);
    expect(cfg.dir).toBe('/mnt/backups');
  });

  it('falls back to defaults for invalid retention/interval (NaN, zero, negative)', () => {
    const cfg = getBackupConfig(
      { SQLITE_BACKUP_RETENTION: '-1', SQLITE_BACKUP_INTERVAL_MS: 'abc' },
      '/data/app.db'
    );
    expect(cfg.retention).toBe(7);
    expect(cfg.intervalMs).toBe(86_400_000);
  });
});

describe('runBackup (integration with a real file DB)', () => {
  let dir: string;
  let dbPath: string;
  let raw: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sqlite-backup-'));
    dbPath = join(dir, 'app.db');
    raw = new Database(dbPath);
    raw.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    raw.prepare('INSERT INTO t (v) VALUES (?)').run('hello');
  });

  afterEach(() => {
    try {
      raw.close();
    } catch {
      /* ignore */
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a consistent backup file that contains the live data', async () => {
    const backupDir = join(dir, 'backups');
    const cfg = { enabled: true, intervalMs: 1000, retention: 7, dir: backupDir };
    const date = new Date(Date.UTC(2026, 5, 25, 14, 0, 0));

    const result = await runBackup(raw, cfg, date, { env: {} });

    expect(existsSync(result.path)).toBe(true);
    expect(result.path).toBe(join(backupDir, 'app-20260625-140000.db'));
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.sha256).toBe(sha256File(result.path));

    // Backup is a standalone DB readable on its own with the same data.
    const restored = new Database(result.path, { readonly: true });
    const row = restored.prepare('SELECT v FROM t WHERE id = 1').get() as { v: string };
    restored.close();
    expect(row.v).toBe('hello');
  });

  it('creates the backup directory if it does not exist', async () => {
    const backupDir = join(dir, 'nested', 'backups');
    expect(existsSync(backupDir)).toBe(false);
    const cfg = { enabled: true, intervalMs: 1000, retention: 7, dir: backupDir };

    await runBackup(raw, cfg, new Date(Date.UTC(2026, 5, 25, 14, 0, 0)), { env: {} });

    expect(existsSync(backupDir)).toBe(true);
  });

  it('prunes the oldest backups beyond retention, keeping the live DB untouched', async () => {
    const backupDir = join(dir, 'backups');
    const cfg = { enabled: true, intervalMs: 1000, retention: 2, dir: backupDir };

    const paths: string[] = [];
    for (let i = 0; i < 4; i++) {
      const date = new Date(Date.UTC(2026, 5, 25, 10 + i, 0, 0));
      const r = await runBackup(raw, cfg, date, { env: {} });
      paths.push(r.path);
    }

    const remaining = readdirSync(backupDir).filter((f) => BACKUP_FILE_REGEX.test(f)).sort();
    expect(remaining).toEqual(['app-20260625-120000.db', 'app-20260625-130000.db']);
    // live DB still intact
    expect(existsSync(dbPath)).toBe(true);
  });

  it('calls the offsite sink after a successful local dump with sha256 meta', async () => {
    resetOffsiteBackupStatusForTests();
    const backupDir = join(dir, 'backups');
    const cfg = { enabled: true, intervalMs: 1000, retention: 7, dir: backupDir };
    const date = new Date(Date.UTC(2026, 5, 25, 14, 0, 0));
    const uploads: Array<{ path: string; meta: OffsiteBackupMeta }> = [];
    const sink: OffsiteBackupSink = {
      upload: async (localPath, meta) => {
        uploads.push({ path: localPath, meta });
      },
    };

    const result = await runBackup(raw, cfg, date, { sink, env: {} });

    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.path).toBe(result.path);
    expect(uploads[0]?.meta.sha256).toBe(result.sha256);
    expect(uploads[0]?.meta.bytes).toBe(result.bytes);
    expect(uploads[0]?.meta.takenAt).toBe(date.toISOString());
    expect(getOffsiteBackupStatus({}).lastResult).toBe('ok');
  });

  it('sink failure does not fail the local backup or block prune', async () => {
    resetOffsiteBackupStatusForTests();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const backupDir = join(dir, 'backups');
    const cfg = { enabled: true, intervalMs: 1000, retention: 1, dir: backupDir };

    // seed an older dump so prune has work
    await runBackup(raw, cfg, new Date(Date.UTC(2026, 5, 25, 10, 0, 0)), { env: {} });

    const sink: OffsiteBackupSink = {
      upload: async () => {
        throw new Error('upstream 500');
      },
    };

    const result = await runBackup(raw, cfg, new Date(Date.UTC(2026, 5, 25, 14, 0, 0)), {
      sink,
      env: {},
    });

    expect(existsSync(result.path)).toBe(true);
    expect(result.prunedCount).toBe(1);
    const remaining = readdirSync(backupDir).filter((f) => BACKUP_FILE_REGEX.test(f));
    expect(remaining).toEqual(['app-20260625-140000.db']);
    expect(getOffsiteBackupStatus({}).lastResult).toBe('failed');
    expect(warnSpy).toHaveBeenCalledWith(
      'SQLite offsite backup upload failed',
      expect.objectContaining({ error: 'upstream 500' })
    );
    warnSpy.mockRestore();
  });

  it('noop sink when URL unset leaves offsite status null and does not log', async () => {
    resetOffsiteBackupStatusForTests();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const backupDir = join(dir, 'backups');
    const cfg = { enabled: true, intervalMs: 1000, retention: 7, dir: backupDir };

    await runBackup(raw, cfg, new Date(Date.UTC(2026, 5, 25, 14, 0, 0)), {
      env: {}, // no SQLITE_OFFSITE_BACKUP_URL
    });

    expect(getOffsiteBackupStatus({}).configured).toBe(false);
    expect(getOffsiteBackupStatus({}).lastResult).toBeNull();
    expect(warnSpy).not.toHaveBeenCalledWith(
      'SQLite offsite backup upload failed',
      expect.anything()
    );
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });
});

describe('createOffsiteSink / NoopOffsiteSink', () => {
  it('returns NoopOffsiteSink when SQLITE_OFFSITE_BACKUP_URL is unset or blank', async () => {
    expect(createOffsiteSink({})).toBeInstanceOf(NoopOffsiteSink);
    expect(createOffsiteSink({ SQLITE_OFFSITE_BACKUP_URL: '  ' })).toBeInstanceOf(NoopOffsiteSink);
    // genuine no-op: resolves without throwing or side effects
    await expect(
      createOffsiteSink({}).upload('/tmp/x.db', { takenAt: 't', bytes: 1, sha256: 'a' })
    ).resolves.toBeUndefined();
  });

  it('returns HttpsPutOffsiteSink when URL is set', () => {
    expect(
      createOffsiteSink({ SQLITE_OFFSITE_BACKUP_URL: 'https://example.com/put' })
    ).toBeInstanceOf(HttpsPutOffsiteSink);
    const status = getOffsiteBackupStatus({ SQLITE_OFFSITE_BACKUP_URL: 'https://example.com/put' });
    expect(status.configured).toBe(true);
    expect(status.invalidUrl).toBe(false);
  });

  // 여기서 올라가는 것은 전체 사용자 행·scrypt 해시·암호화된 API 키다.
  // 평문 HTTP로 나가면 경로상의 누구나 가져간다 — 업로드하느니 안 하는 게 낫다(fail-closed).
  it('http:// URL은 fail-closed로 거부하고 업로드하지 않는다', () => {
    expect(
      createOffsiteSink({ SQLITE_OFFSITE_BACKUP_URL: 'http://example.com/put' })
    ).toBeInstanceOf(NoopOffsiteSink);
  });

  it('https가 아닌 스킴 전반을 거부한다', () => {
    for (const url of ['http://a/b', 'ftp://a/b', 'file:///etc/passwd', '//a/b', 'example.com/b']) {
      expect(createOffsiteSink({ SQLITE_OFFSITE_BACKUP_URL: url })).toBeInstanceOf(NoopOffsiteSink);
    }
  });

  it('오설정을 감추지 않는다 — configured=false 이면서 invalidUrl=true로 드러난다', () => {
    const status = getOffsiteBackupStatus({ SQLITE_OFFSITE_BACKUP_URL: 'http://example.com/put' });
    // "설정했는데 왜 안 올라가지?"를 admin/debug에서 바로 알 수 있어야 한다
    expect(status.configured).toBe(false);
    expect(status.invalidUrl).toBe(true);
  });

  it('URL 미설정이면 invalidUrl도 false다 (미설정과 오설정을 구분한다)', () => {
    expect(getOffsiteBackupStatus({})).toMatchObject({ configured: false, invalidUrl: false });
  });

  it('HttpsPutOffsiteSink PUTs raw bytes with sha256 headers', async () => {
    const bodyFile = mkdtempSync(join(tmpdir(), 'offsite-body-'));
    const filePath = join(bodyFile, 'app-20260625-140000.db');
    writeFileSync(filePath, 'dump-bytes');

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const sink = new HttpsPutOffsiteSink('https://example.com/backup-put?token=secret');
    await sink.upload(filePath, {
      takenAt: '2026-06-25T14:00:00.000Z',
      bytes: 10,
      sha256: 'abc',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/backup-put?token=secret');
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['X-Backup-Sha256']).toBe('abc');
    expect((init.headers as Record<string, string>)['X-Backup-Taken-At']).toBe(
      '2026-06-25T14:00:00.000Z'
    );

    vi.unstubAllGlobals();
    rmSync(bodyFile, { recursive: true, force: true });
  });
});

describe('scheduleBackups', () => {
  it('runs an initial backup immediately and returns a stop() that clears the interval', async () => {
    const calls: number[] = [];
    let intervalCb: (() => void) | null = null;
    let cleared = false;

    const stop = scheduleBackups(
      {} as Database.Database,
      { enabled: true, intervalMs: 1000, retention: 7, dir: '/tmp/x' },
      {
        runFn: async () => {
          calls.push(1);
          return { path: '/tmp/x/app.db', prunedCount: 0, bytes: 1, sha256: 'a'.repeat(64) };
        },
        setIntervalFn: (cb: () => void) => {
          intervalCb = cb;
          return 42;
        },
        clearIntervalFn: () => {
          cleared = true;
        },
        now: () => new Date(Date.UTC(2026, 5, 25, 0, 0, 0)),
      }
    );

    // initial backup fired synchronously on schedule
    expect(calls.length).toBe(1);

    // interval callback drives subsequent backups
    intervalCb!();
    await Promise.resolve();
    expect(calls.length).toBe(2);

    stop();
    expect(cleared).toBe(true);
  });

  it('does nothing and returns a no-op when disabled', () => {
    let scheduled = false;
    const stop = scheduleBackups(
      {} as Database.Database,
      { enabled: false, intervalMs: 1000, retention: 7, dir: '/tmp/x' },
      {
        runFn: async () => ({ path: '', prunedCount: 0, bytes: 0, sha256: '' }),
        setIntervalFn: () => {
          scheduled = true;
          return 0;
        },
        clearIntervalFn: () => {},
        now: () => new Date(Date.UTC(2026, 5, 25, 0, 0, 0)),
      }
    );
    expect(scheduled).toBe(false);
    expect(() => stop()).not.toThrow();
  });

  it('uses real timers (unref + clearInterval) when timer deps are omitted', async () => {
    let backups = 0;
    // Only runFn is injected → default setIntervalFn/clearIntervalFn/now (real timers) are exercised.
    // Large interval so the periodic tick never fires during the test; only the initial backup runs.
    const stop = scheduleBackups(
      {} as Database.Database,
      { enabled: true, intervalMs: 1_000_000, retention: 7, dir: '/tmp/x' },
      {
        runFn: async () => {
          backups++;
          return { path: '/tmp/x/app.db', prunedCount: 0, bytes: 1, sha256: 'a'.repeat(64) };
        },
      }
    );

    expect(backups).toBe(1); // initial backup fired through the real schedule path
    expect(() => stop()).not.toThrow(); // default clearIntervalFn clears the real interval
  });

  it('logs an error (without throwing) when a backup run rejects', async () => {
    const errSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const stop = scheduleBackups(
      {} as Database.Database,
      { enabled: true, intervalMs: 1000, retention: 7, dir: '/tmp/x' },
      {
        runFn: async () => {
          throw new Error('disk full');
        },
        setIntervalFn: () => 0,
        clearIntervalFn: () => {},
        now: () => new Date(0),
      }
    );

    // flush the rejection-handling microtasks
    await Promise.resolve();
    await Promise.resolve();

    expect(errSpy).toHaveBeenCalledWith(
      'SQLite backup failed',
      expect.objectContaining({ error: 'disk full' })
    );

    stop();
    errSpy.mockRestore();
  });

  it('stringifies non-Error rejections in the failure log', async () => {
    const errSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const stop = scheduleBackups(
      {} as Database.Database,
      { enabled: true, intervalMs: 1000, retention: 7, dir: '/tmp/x' },
      {
        runFn: () => Promise.reject('boom'),
        setIntervalFn: () => 0,
        clearIntervalFn: () => {},
        now: () => new Date(0),
      }
    );

    // drain microtasks (rejection handler runs asynchronously)
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errSpy).toHaveBeenCalledWith(
      'SQLite backup failed',
      expect.objectContaining({ error: 'boom' })
    );

    stop();
    errSpy.mockRestore();
  });

  type RunOutcome = 'ok' | 'fail';

  async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  type AlertFnMock = ReturnType<typeof vi.fn<(opts: SlackAlertOptions) => void | Promise<void>>>;

  function scheduleWithOutcomes(
    outcomes: RunOutcome[],
    alertFn: AlertFnMock = vi.fn<(opts: SlackAlertOptions) => void | Promise<void>>().mockResolvedValue(
      undefined
    )
  ): {
    stop: () => void;
    tick: () => void;
    alertFn: AlertFnMock;
  } {
    let idx = 0;
    let intervalCb: (() => void) | null = null;

    const stop = scheduleBackups(
      {} as Database.Database,
      { enabled: true, intervalMs: 1000, retention: 7, dir: '/data/backups' },
      {
        runFn: async () => {
          const outcome = outcomes[idx] ?? outcomes[outcomes.length - 1] ?? 'ok';
          idx += 1;
          if (outcome === 'fail') {
            throw new Error('disk full');
          }
          return { path: '/data/backups/app.db', prunedCount: 0, bytes: 1, sha256: 'a'.repeat(64) };
        },
        setIntervalFn: (cb: () => void) => {
          intervalCb = cb;
          return 0;
        },
        clearIntervalFn: () => {},
        now: () => new Date(0),
        alertFn,
      }
    );

    return {
      stop,
      tick: (): void => {
        intervalCb!();
      },
      alertFn,
    };
  }

  describe('backup failure alerting (state transitions)', () => {
    it('null→fail: first-ever failure alerts once at error level', async () => {
      const { stop, alertFn } = scheduleWithOutcomes(['fail']);
      await flushMicrotasks();

      expect(alertFn).toHaveBeenCalledTimes(1);
      expect(alertFn.mock.calls[0][0]).toMatchObject({
        level: 'error',
        fields: expect.objectContaining({
          dir: '/data/backups',
          error: 'disk full',
          consecutiveFailures: 1,
        }),
      });

      stop();
    });

    it('true→false: success then failure alerts once at error level', async () => {
      const { stop, tick, alertFn } = scheduleWithOutcomes(['ok', 'fail']);
      await flushMicrotasks();
      expect(alertFn).not.toHaveBeenCalled(); // null→true: no alert

      tick();
      await flushMicrotasks();

      expect(alertFn).toHaveBeenCalledTimes(1);
      expect(alertFn.mock.calls[0][0]).toMatchObject({ level: 'error' });

      stop();
    });

    it('false→false: consecutive failures suppress further alerts', async () => {
      const { stop, tick, alertFn } = scheduleWithOutcomes(['fail', 'fail', 'fail']);
      await flushMicrotasks();
      expect(alertFn).toHaveBeenCalledTimes(1);

      tick();
      await flushMicrotasks();
      tick();
      await flushMicrotasks();

      expect(alertFn).toHaveBeenCalledTimes(1);
      expect(alertFn.mock.calls[0][0]).toMatchObject({ level: 'error' });

      stop();
    });

    it('false→true: recovery after failures alerts once at info level', async () => {
      const { stop, tick, alertFn } = scheduleWithOutcomes(['fail', 'ok']);
      await flushMicrotasks();
      expect(alertFn).toHaveBeenCalledTimes(1);
      expect(alertFn.mock.calls[0][0]).toMatchObject({ level: 'error' });

      tick();
      await flushMicrotasks();

      expect(alertFn).toHaveBeenCalledTimes(2);
      expect(alertFn.mock.calls[1][0]).toMatchObject({
        level: 'info',
        fields: expect.objectContaining({
          dir: '/data/backups',
          consecutiveFailures: 1,
        }),
      });

      stop();
    });

    it('true→true: repeated successes do not alert', async () => {
      const { stop, tick, alertFn } = scheduleWithOutcomes(['ok', 'ok']);
      await flushMicrotasks();
      tick();
      await flushMicrotasks();

      expect(alertFn).not.toHaveBeenCalled();

      stop();
    });

    it('null→true: first-ever success does not alert', async () => {
      const { stop, alertFn } = scheduleWithOutcomes(['ok']);
      await flushMicrotasks();

      expect(alertFn).not.toHaveBeenCalled();

      stop();
    });

    it('increments consecutiveFailures across suppressed fails, reports on first alert, resets on success', async () => {
      const { stop, tick, alertFn } = scheduleWithOutcomes(['fail', 'fail', 'fail', 'ok', 'fail']);
      await flushMicrotasks();

      expect(alertFn).toHaveBeenCalledTimes(1);
      expect(alertFn.mock.calls[0][0].fields).toMatchObject({ consecutiveFailures: 1 });

      tick(); // fail #2 — suppressed
      await flushMicrotasks();
      tick(); // fail #3 — suppressed
      await flushMicrotasks();
      expect(alertFn).toHaveBeenCalledTimes(1);

      tick(); // recovery
      await flushMicrotasks();
      expect(alertFn).toHaveBeenCalledTimes(2);
      expect(alertFn.mock.calls[1][0]).toMatchObject({
        level: 'info',
        fields: expect.objectContaining({ consecutiveFailures: 3 }),
      });

      tick(); // fail again after recovery — new edge
      await flushMicrotasks();
      expect(alertFn).toHaveBeenCalledTimes(3);
      expect(alertFn.mock.calls[2][0]).toMatchObject({
        level: 'error',
        fields: expect.objectContaining({ consecutiveFailures: 1 }),
      });

      stop();
    });

    it('two scheduleBackups instances do not share alert state', async () => {
      const alertA = vi
        .fn<(opts: SlackAlertOptions) => void | Promise<void>>()
        .mockResolvedValue(undefined);
      const alertB = vi
        .fn<(opts: SlackAlertOptions) => void | Promise<void>>()
        .mockResolvedValue(undefined);

      const a = scheduleWithOutcomes(['fail', 'fail'], alertA);
      const b = scheduleWithOutcomes(['ok', 'ok'], alertB);
      await flushMicrotasks();

      expect(alertA).toHaveBeenCalledTimes(1);
      expect(alertB).not.toHaveBeenCalled();

      a.tick();
      b.tick();
      await flushMicrotasks();

      // A still suppressed; B still quiet
      expect(alertA).toHaveBeenCalledTimes(1);
      expect(alertB).not.toHaveBeenCalled();

      a.stop();
      b.stop();
    });

    it('a rejecting alertFn does not skip logger.error and does not throw; stop() still works', async () => {
      const errSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const alertFn = vi
        .fn<(opts: SlackAlertOptions) => void | Promise<void>>()
        .mockRejectedValue(new Error('webhook down'));

      const { stop } = scheduleWithOutcomes(['fail'], alertFn);
      await flushMicrotasks();
      // drain alert rejection catch
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(errSpy).toHaveBeenCalledWith(
        'SQLite backup failed',
        expect.objectContaining({ error: 'disk full' })
      );
      expect(alertFn).toHaveBeenCalledTimes(1);
      expect(() => stop()).not.toThrow();

      errSpy.mockRestore();
    });
  });
});
