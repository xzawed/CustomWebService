import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { logger } from '@/lib/utils/logger';
import * as schema from './schema';

export type SqliteDb = ReturnType<typeof drizzle<typeof schema>>;

let _db: SqliteDb | null = null;
let _raw: Database.Database | null = null;

/** SQLite 파일 경로. 프로덕션은 Railway 영속 볼륨(/data) 하위를 기본으로 한다. */
export function getSqlitePath(): string {
  return process.env.SQLITE_PATH ?? '/data/app.db';
}

/**
 * 새 SQLite 연결을 만들고 권장 pragma를 적용한다.
 * 테스트는 ':memory:' 를 주입해 격리된 인메모리 DB로 검증한다.
 */
export function createSqliteConnection(path: string): { db: SqliteDb; raw: Database.Database } {
  const raw = new Database(path);
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  // WAL: 읽기-쓰기 동시성 향상 (디스크 DB 전용; ':memory:'엔 적용 불가/무의미)
  if (path !== ':memory:') {
    raw.pragma('journal_mode = WAL');
  }
  // NORMAL: 성능/내구성 균형. 원자성이 중요한 쓰기는 호출부에서 BEGIN IMMEDIATE 트랜잭션으로 보강한다.
  raw.pragma('synchronous = NORMAL');
  const db = drizzle(raw, { schema });
  return { db, raw };
}

let _warnedDefaultProvider = false;

/**
 * 연결을 열기 전 환경을 검사한다.
 *
 * `DB_PROVIDER`는 과거 이중 스택(supabase/postgres/sqlite) 스위치의 잔재다. 단일 스택이 된
 * 지금은 분기할 대상이 없으므로 **미설정을 장애로 취급하지 않는다** — env 문자열 하나를 잃었다고
 * 모든 DB 접근이 죽는 것이 이 서비스의 가장 위험한 단일 지점이었다(WBS C5).
 *
 * - 미설정·빈 문자열 → sqlite (부팅 1회 경고)
 * - `'sqlite'`       → 정상
 * - 그 외 값         → throw. 오설정을 조용히 삼키면 의도와 다른 스택으로 뜬 줄 모른다
 *
 * 테스트 환경에서 `SQLITE_PATH`가 없으면 throw한다. 예전에는 `DB_PROVIDER`가 테스트에
 * 설정돼 있지 않다는 **우연** 덕분에 실수로 실제 파일 DB를 여는 사고가 막혀 있었는데,
 * 위에서 미설정을 허용하면 그 우연이 사라진다. "경로가 없어 어차피 실패한다"에는 기댈 수 없다 —
 * 러너 이미지가 `mkdir -p /data`로 **항상 쓰기 가능한 디렉터리를 만든다**(Dockerfile).
 */
function assertSqliteEnv(): void {
  const provider = process.env.DB_PROVIDER?.trim();

  if (provider && provider !== 'sqlite') {
    throw new Error(
      `DB_PROVIDER="${provider}"는 지원하지 않습니다. 이 서비스는 SQLite 단일 스택입니다 ('sqlite' 또는 미설정).`,
    );
  }

  if (process.env.NODE_ENV === 'test' && !process.env.SQLITE_PATH) {
    throw new Error(
      '테스트에서는 SQLITE_PATH를 명시해야 합니다(예: ":memory:"). ' +
        '기본 경로로 실제 파일 DB를 여는 사고를 막습니다.',
    );
  }

  if (!provider && !_warnedDefaultProvider) {
    _warnedDefaultProvider = true;
    logger.warn('DB_PROVIDER 미설정 — sqlite 기본값으로 연결합니다', {
      sqlitePath: getSqlitePath(),
    });
  }
}

/** SQLite 싱글톤 연결. 환경 검사는 `assertSqliteEnv()` 참조. */
export function getSqliteDb(): SqliteDb {
  if (_db) return _db;
  assertSqliteEnv();
  const { db, raw } = createSqliteConnection(getSqlitePath());
  _db = db;
  _raw = raw;
  return _db;
}

/**
 * 싱글톤을 뒷받침하는 raw better-sqlite3 연결을 반환한다(없으면 초기화).
 * 온라인 백업(`.backup()`)처럼 drizzle 래퍼가 노출하지 않는 기능에 접근할 때 사용한다.
 */
export function getSqliteRawConnection(): Database.Database {
  getSqliteDb(); // 싱글톤 초기화 보장(DB_PROVIDER 가드도 여기서 적용)
  if (!_raw) {
    throw new Error('SQLite raw 연결이 초기화되지 않았습니다.');
  }
  return _raw;
}

/** 마이그레이션 적용 (부팅 시 또는 테스트 셋업). */
export function runSqliteMigrations(db: SqliteDb, migrationsFolder = './drizzle/sqlite'): void {
  migrate(db, { migrationsFolder });
}

/** 연결을 닫고 싱글톤을 초기화한다 (테스트 정리·재초기화용). */
export function resetSqliteConnection(): void {
  if (_raw) {
    try {
      _raw.close();
    } catch {
      // already closed — ignore
    }
    _raw = null;
  }
  _db = null;
  // 경고 1회 플래그도 함께 되돌린다. 아니면 테스트 순서에 따라 경고 단언이 흔들린다.
  _warnedDefaultProvider = false;
}
