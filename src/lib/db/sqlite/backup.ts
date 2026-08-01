import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type Database from 'better-sqlite3';
import { sendSlackAlert, type SlackAlertOptions } from '@/lib/monitoring/slackAlert';
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
  /** 덤프 바이트 수(로컬 쓰기 성공 후). */
  bytes: number;
  /** 덤프 파일 sha256(hex). */
  sha256: string;
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
 * 백업 패턴(`BACKUP_FILE_REGEX`)에 맞는 파일명만 골라 시간순(사전식 = UTC 타임스탬프순)으로 반환한다.
 * 라이브 DB·WAL/SHM·기타 파일은 절대 포함되지 않는다. prune·다운로드 모두 이 목록을 재사용한다.
 */
export function listBackupFilenames(files: string[]): string[] {
  return files.filter((f) => BACKUP_FILE_REGEX.test(f)).sort((a, b) => a.localeCompare(b));
}

/**
 * 보관 정책에 따라 삭제 대상 백업 파일명을 고른다.
 * 백업 패턴에 맞는 파일만 후보로 삼으므로 라이브 DB·WAL·기타 파일은 절대 삭제되지 않는다.
 * 파일명이 `app-<timestamp>.db`라 사전식 정렬 = 시간순 정렬.
 */
export function selectBackupsToPrune(files: string[], retention: number): string[] {
  const backups = listBackupFilenames(files);
  if (backups.length <= retention) return [];
  return backups.slice(0, backups.length - retention);
}

/**
 * 가장 최근 백업 파일명(basename)을 고른다. 없으면 null.
 * 클라이언트 입력을 받지 않고 **서버가 디렉터리 목록에서만** 고른다(경로 순회 차단).
 */
export function selectLatestBackupFilename(files: string[]): string | null {
  const backups = listBackupFilenames(files);
  if (backups.length === 0) return null;
  return backups[backups.length - 1] ?? null;
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

// ─── Off-site sink seam (기본 no-op; URL 설정 시 HTTPS PUT) ─────────────────

export interface OffsiteBackupMeta {
  takenAt: string;
  bytes: number;
  sha256: string;
}

/** 로컬 덤프 성공 후 오프사이트에 올리는 선택 싱크. 실패해도 로컬 백업을 깨뜨리면 안 된다. */
export interface OffsiteBackupSink {
  upload(localPath: string, meta: OffsiteBackupMeta): Promise<void>;
}

/** `SQLITE_OFFSITE_BACKUP_URL` 미설정 시 기본값 — 로그도 남기지 않는 진짜 no-op. */
export class NoopOffsiteSink implements OffsiteBackupSink {
  async upload(_localPath: string, _meta: OffsiteBackupMeta): Promise<void> {
    // genuine no-op — 주기마다 로그 스팸 금지
  }
}

/**
 * 원시 파일 바이트를 HTTPS PUT으로 보낸다. S3 SDK·추가 의존성 없음.
 * 헤더에 sha256·timestamp를 실어 수신측(R2 worker·presigned URL·자체 엔드포인트)이 검증할 수 있게 한다.
 */
export class HttpsPutOffsiteSink implements OffsiteBackupSink {
  constructor(private readonly url: string) {}

  async upload(localPath: string, meta: OffsiteBackupMeta): Promise<void> {
    const body = readFileSync(localPath);
    const res = await fetch(this.url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(meta.bytes),
        'X-Backup-Sha256': meta.sha256,
        'X-Backup-Taken-At': meta.takenAt,
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`offsite PUT failed: HTTP ${res.status}`);
    }
  }
}

/**
 * 오프사이트 URL은 **반드시 `https://`** 여야 한다.
 *
 * 여기서 올라가는 것은 시스템에서 가장 민감한 단일 아티팩트다 — 전체 사용자 행, scrypt 비밀번호 해시,
 * 암호화된 사용자 API 키, 생성 코드 전부. 평문 HTTP로 나가면 경로상의 누구나 그대로 가져간다.
 * 따라서 `http://`는 **fail-closed로 거부**한다(업로드 안 함). 평문 전송보다 백업 미전송이 낫다.
 */
export function isValidOffsiteUrl(url: string): boolean {
  return url.startsWith('https://');
}

/**
 * env에서 오프사이트 싱크를 만든다. URL 미설정/공백이면 Noop. URL 자체는 반환하지 않는다(토큰 가능).
 *
 * URL이 https가 아니면 **조용히 넘어가지 않고** error 로그를 남긴 뒤 Noop을 돌려준다.
 * 오설정이 관측 가능해야 하므로 `getOffsiteBackupStatus().invalidUrl`에도 드러난다.
 */
export function createOffsiteSink(
  env: Record<string, string | undefined> = process.env
): OffsiteBackupSink {
  const url = env.SQLITE_OFFSITE_BACKUP_URL?.trim();
  if (!url) return new NoopOffsiteSink();
  if (!isValidOffsiteUrl(url)) {
    logger.error('SQLITE_OFFSITE_BACKUP_URL이 https가 아니라 오프사이트 백업을 비활성화했다', {
      // URL 원문은 토큰을 포함할 수 있어 남기지 않는다. 스킴만으로 진단에 충분하다.
      scheme: url.split(':')[0],
    });
    return new NoopOffsiteSink();
  }
  return new HttpsPutOffsiteSink(url);
}

export type OffsiteBackupLastResult = 'ok' | 'failed' | null;

export interface OffsiteBackupStatus {
  /**
   * **실제로 동작 가능한** 오프사이트 백업이 설정됐는지. URL 원문은 절대 노출하지 않는다.
   * env는 있으나 https가 아니면 `false`다 — "설정했는데 안 올라간다"를 감추지 않기 위함이다.
   */
  configured: boolean;
  /** env는 설정됐으나 https가 아니어서 비활성화된 상태. 오설정을 눈에 보이게 한다. */
  invalidUrl: boolean;
  lastResult: OffsiteBackupLastResult;
  lastAt: string | null;
}

/** 모듈 로컬 — scheduleBackups 경보 상태와 같이 인스턴스/프로세스 단위. URL은 저장하지 않는다. */
let lastOffsiteResult: OffsiteBackupLastResult = null;
let lastOffsiteAt: string | null = null;

export function getOffsiteBackupStatus(
  env: Record<string, string | undefined> = process.env
): OffsiteBackupStatus {
  const url = env.SQLITE_OFFSITE_BACKUP_URL?.trim();
  const present = Boolean(url);
  const valid = present && isValidOffsiteUrl(url as string);
  return {
    configured: valid,
    invalidUrl: present && !valid,
    lastResult: lastOffsiteResult,
    lastAt: lastOffsiteAt,
  };
}

/** 테스트 전용 — 모듈 오프사이트 상태 초기화. */
export function resetOffsiteBackupStatusForTests(): void {
  lastOffsiteResult = null;
  lastOffsiteAt = null;
}

function recordOffsiteResult(result: 'ok' | 'failed', at: Date = new Date()): void {
  lastOffsiteResult = result;
  lastOffsiteAt = at.toISOString();
}

/** 덤프 파일 sha256(hex). ~418KB 규모라 동기 read 후 해시로 충분. */
export function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export interface RunBackupDeps {
  /** 기본: env 기반 createOffsiteSink(). 테스트 주입용. */
  sink?: OffsiteBackupSink;
  /** 기본: sha256File. 테스트 주입용. */
  hashFn?: (filePath: string) => string;
  /** 기본: process.env (configured 판별·createOffsiteSink). */
  env?: Record<string, string | undefined>;
}

/**
 * SQLite 온라인 백업을 1회 수행한다. better-sqlite3의 `.backup()`은 WAL 모드에서도 일관된
 * 스냅샷을 자체 완결 파일로 남긴다(라이브 쓰기를 차단하지 않음). 이후 보관 정책으로 오래된 백업을 정리한다.
 *
 * 오프사이트 싱크는 **로컬 덤프 성공 후에만** 호출하며, 싱크 실패는 로컬 백업·prune을 실패로 만들지 않는다.
 */
export async function runBackup(
  raw: Database.Database,
  config: BackupConfig,
  date: Date,
  deps: RunBackupDeps = {}
): Promise<BackupResult> {
  if (!existsSync(config.dir)) {
    mkdirSync(config.dir, { recursive: true });
  }

  const path = join(config.dir, `app-${formatBackupTimestamp(date)}.db`);
  await raw.backup(path);

  const bytes = statSync(path).size;
  const hashFn = deps.hashFn ?? sha256File;
  const sha256 = hashFn(path);
  const takenAt = date.toISOString();
  const env = deps.env ?? process.env;
  const sink = deps.sink ?? createOffsiteSink(env);
  const offsiteConfigured =
    deps.sink !== undefined
      ? !(sink instanceof NoopOffsiteSink)
      : Boolean(env.SQLITE_OFFSITE_BACKUP_URL?.trim());

  // 오프사이트 실패는 로컬 성공을 오염시키지 않는다 — try/catch, rethrow 금지
  try {
    await sink.upload(path, { takenAt, bytes, sha256 });
    if (offsiteConfigured) {
      recordOffsiteResult('ok');
    }
  } catch (err: unknown) {
    if (offsiteConfigured) {
      recordOffsiteResult('failed');
    }
    logger.warn('SQLite offsite backup upload failed', {
      error: err instanceof Error ? err.message : String(err),
      // URL은 토큰을 담을 수 있으므로 절대 로깅하지 않는다
      bytes,
      sha256,
    });
  }

  const toPrune = selectBackupsToPrune(readdirSync(config.dir), config.retention);
  for (const f of toPrune) {
    try {
      unlinkSync(join(config.dir, f));
    } catch {
      // 동시성/이미 삭제됨 — 무시
    }
  }

  return { path, prunedCount: toPrune.length, bytes, sha256 };
}

interface ScheduleDeps {
  runFn?: typeof runBackup;
  /** 테스트 주입용. 핸들 타입은 의도적으로 느슨하게(`unknown`) 둔다(DOM/Node `setInterval` 오버로드 회피). */
  setIntervalFn?: (callback: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  now?: () => Date;
  /**
   * 백업 실패·복구 경보. 기본 `sendSlackAlert`.
   * 알림 실패가 스케줄러를 깨뜨리지 않도록 호출부는 항상 void+catch로 감싼다.
   */
  alertFn?: (opts: SlackAlertOptions) => void | Promise<void>;
}

/**
 * 주기 백업을 시작한다(부팅 시 즉시 1회 + 이후 `intervalMs` 간격). 비활성이면 no-op.
 * 타이머는 `unref()`하여 백업 때문에 프로세스가 종료를 못 하는 일이 없도록 한다.
 * 반환된 함수를 호출하면 스케줄을 중단한다. 의존성 주입으로 결정적 단위 테스트가 가능하다.
 *
 * 경보는 상태 전이만: null/true→fail 시 error 1회, fail→success 시 info 복구 1회.
 * 연속 실패 중에는 억제한다. 상태·카운터는 클로저 로컬(인스턴스 독립, 모듈 플래그 없음).
 * 오프사이트 실패는 별도 경보 상태 머신을 두지 않고 `getOffsiteBackupStatus()`로만 노출한다.
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
    alertFn = sendSlackAlert,
  } = deps;

  if (!config.enabled) return () => {};

  /** null = 아직 완료된 실행 없음, true = 최근 성공, false = 최근 실패 */
  let healthy: boolean | null = null;
  let consecutiveFailures = 0;

  const safeAlert = (opts: SlackAlertOptions): void => {
    void Promise.resolve(alertFn(opts)).catch((alertErr: unknown) => {
      logger.warn('SQLite backup alert failed', {
        error: alertErr instanceof Error ? alertErr.message : String(alertErr),
      });
    });
  };

  const tick = (): void => {
    void runFn(raw, config, now()).then(
      (r) => {
        logger.info('SQLite backup written', { path: r.path, pruned: r.prunedCount });

        const wasFailing = healthy === false;
        const failuresBeforeRecovery = consecutiveFailures;
        healthy = true;
        consecutiveFailures = 0;

        if (wasFailing) {
          safeAlert({
            level: 'info',
            title: 'SQLite 백업 복구',
            message: `백업이 정상 복구되었습니다. (연속 실패 ${failuresBeforeRecovery}회 후)`,
            fields: {
              dir: config.dir,
              consecutiveFailures: failuresBeforeRecovery,
            },
          });
        }
      },
      (err: unknown) => {
        // 1) log first (sync) — must not depend on alert
        const error = err instanceof Error ? err.message : String(err);
        logger.error('SQLite backup failed', { error });

        // 2) state transition (sync) before any async alert
        const shouldAlert = healthy !== false; // null (first) or true (was ok)
        consecutiveFailures += 1;
        healthy = false;

        // 3) alert last — void+catch so webhook failures cannot poison the scheduler
        if (shouldAlert) {
          safeAlert({
            level: 'error',
            title: 'SQLite 백업 실패',
            message: '주기 백업이 실패했습니다. 볼륨·디스크·경로를 확인하세요.',
            fields: {
              dir: config.dir,
              error: error.slice(0, 200),
              consecutiveFailures,
            },
          });
        }
      }
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
