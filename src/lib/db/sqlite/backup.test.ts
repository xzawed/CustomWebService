import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formatBackupTimestamp,
  selectBackupsToPrune,
  getBackupConfig,
  runBackup,
  scheduleBackups,
  BACKUP_FILE_REGEX,
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

describe('selectBackupsToPrune', () => {
  const mk = (ts: string): string => `app-${ts}.db`;

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

    const result = await runBackup(raw, cfg, date);

    expect(existsSync(result.path)).toBe(true);
    expect(result.path).toBe(join(backupDir, 'app-20260625-140000.db'));

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

    await runBackup(raw, cfg, new Date(Date.UTC(2026, 5, 25, 14, 0, 0)));

    expect(existsSync(backupDir)).toBe(true);
  });

  it('prunes the oldest backups beyond retention, keeping the live DB untouched', async () => {
    const backupDir = join(dir, 'backups');
    const cfg = { enabled: true, intervalMs: 1000, retention: 2, dir: backupDir };

    const paths: string[] = [];
    for (let i = 0; i < 4; i++) {
      const date = new Date(Date.UTC(2026, 5, 25, 10 + i, 0, 0));
      const r = await runBackup(raw, cfg, date);
      paths.push(r.path);
    }

    const remaining = readdirSync(backupDir).filter((f) => BACKUP_FILE_REGEX.test(f)).sort();
    expect(remaining).toEqual(['app-20260625-120000.db', 'app-20260625-130000.db']);
    // live DB still intact
    expect(existsSync(dbPath)).toBe(true);
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
          return { path: '/tmp/x/app.db', prunedCount: 0 };
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
        runFn: async () => ({ path: '', prunedCount: 0 }),
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
});
