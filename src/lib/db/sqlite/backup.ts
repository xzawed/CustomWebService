import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type Database from 'better-sqlite3';
import { logger } from '@/lib/utils/logger';
import { getSqlitePath } from './connection';

/** 백업 파일명 패턴: `app-YYYYMMDD-HHmmss.db`. 라이브 DB(`app.db`)·WAL/SHM과 명확히 구분된다. */
export const BACKUP_FILE_REGEX = /^app-\d{8}-\d{6}\.db$/;

const DEFAULT_INTERVAL_MS = 86_400_000; // 24h
const DEFAULT_RETENTION = 7;

export interface BackupConfig {
  /** 백업 스케줄러 활성 여부 (`SQLITE_BACKUP_ENABLED !== 'false'`). */
  enabled: boolean;
  /** 백업 주기(ms). */
  intervalMs: number;
  /** 보관할 백업 개수(가장 최근 N개 유지). */
  retention: number;
  /** 백업 파일을 쓰는 디렉터리. 기본 `<sqlite dir>/backups`. */
  dir: string;
}

export interface BackupResult {
  /** 생성된 백업 파일의 절대/상대 경로. */
  path: string;
  /** 이번 실행에서 보관 정책으로 삭제한 오래된 백업 수. */
  prunedCount: number;
}

/** Date → `YYYYMMDD-HHmmss`(UTC). 파일명 정렬이 곧 시간순이 되도록 고정폭·UTC를 사용한다. */
export function formatBackupTimestamp(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  const y = date.getUTCFullYear();
  return (
    `${y}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `-${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`
  );
}

/**
 * 보관 정책에 따라 삭제 대상 백업 파일명을 고른다.
 * 백업 패턴에 맞는 파일만 후보로 삼으므로 라이브 DB·WAL·기타 파일은 절대 삭제되지 않는다.
 * 파일명이 `app-<timestamp>.db`라 사전식 정렬 = 시간순 정렬.
 */
export function selectBackupsToPrune(files: string[], retention: number): string[] {
  const backups = files.filter((f) => BACKUP_FILE_REGEX.test(f)).sort((a, b) => a.localeCompare(b));
  if (backups.length <= retention) return [];
  return backups.slice(0, backups.length - retention);
}

/** 환경변수에서 백업 설정을 읽는다(잘못된 값은 안전한 기본값으로 폴백). */
export function getBackupConfig(
  env: Record<string, string | undefined> = process.env,
  sqlitePath: string = getSqlitePath()
): BackupConfig {
  const enabled = env.SQLITE_BACKUP_ENABLED !== 'false';

  const intervalRaw = Number(env.SQLITE_BACKUP_INTERVAL_MS);
  const intervalMs = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : DEFAULT_INTERVAL_MS;

  const retentionRaw = Number(env.SQLITE_BACKUP_RETENTION);
  const retention = Number.isInteger(retentionRaw) && retentionRaw >= 1 ? retentionRaw : DEFAULT_RETENTION;

  const dir = env.SQLITE_BACKUP_DIR ?? join(dirname(sqlitePath), 'backups');

  return { enabled, intervalMs, retention, dir };
}

/**
 * SQLite 온라인 백업을 1회 수행한다. better-sqlite3의 `.backup()`은 WAL 모드에서도 일관된
 * 스냅샷을 자체 완결 파일로 남긴다(라이브 쓰기를 차단하지 않음). 이후 보관 정책으로 오래된 백업을 정리한다.
 */
export async function runBackup(
  raw: Database.Database,
  config: BackupConfig,
  date: Date
): Promise<BackupResult> {
  if (!existsSync(config.dir)) {
    mkdirSync(config.dir, { recursive: true });
  }

  const path = join(config.dir, `app-${formatBackupTimestamp(date)}.db`);
  await raw.backup(path);

  const toPrune = selectBackupsToPrune(readdirSync(config.dir), config.retention);
  for (const f of toPrune) {
    try {
      unlinkSync(join(config.dir, f));
    } catch {
      // 동시성/이미 삭제됨 — 무시
    }
  }

  return { path, prunedCount: toPrune.length };
}

interface ScheduleDeps {
  runFn?: typeof runBackup;
  /** 테스트 주입용. 핸들 타입은 의도적으로 느슨하게(`unknown`) 둔다(DOM/Node `setInterval` 오버로드 회피). */
  setIntervalFn?: (callback: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  now?: () => Date;
}

/**
 * 주기 백업을 시작한다(부팅 시 즉시 1회 + 이후 `intervalMs` 간격). 비활성이면 no-op.
 * 타이머는 `unref()`하여 백업 때문에 프로세스가 종료를 못 하는 일이 없도록 한다.
 * 반환된 함수를 호출하면 스케줄을 중단한다. 의존성 주입으로 결정적 단위 테스트가 가능하다.
 */
export function scheduleBackups(
  raw: Database.Database,
  config: BackupConfig,
  deps: ScheduleDeps = {}
): () => void {
  const {
    runFn = runBackup,
    setIntervalFn = (cb: () => void, ms: number): unknown => setInterval(cb, ms),
    clearIntervalFn = (handle: unknown): void => clearInterval(handle as ReturnType<typeof setInterval>),
    now = (): Date => new Date(),
  } = deps;

  if (!config.enabled) return () => {};

  const tick = (): void => {
    void runFn(raw, config, now()).then(
      (r) => logger.info('SQLite backup written', { path: r.path, pruned: r.prunedCount }),
      (err: unknown) =>
        logger.error('SQLite backup failed', {
          error: err instanceof Error ? err.message : String(err),
        })
    );
  };

  const handle = setIntervalFn(tick, config.intervalMs);
  const timer = handle as { unref?: () => void };
  if (typeof timer.unref === 'function') {
    timer.unref(); // 백업 타이머가 프로세스 종료를 막지 않도록
  }

  tick(); // 부팅 직후 즉시 1회 백업

  return () => clearIntervalFn(handle);
}
