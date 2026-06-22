import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
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

/** DB_PROVIDER=sqlite 환경의 싱글톤 연결. */
export function getSqliteDb(): SqliteDb {
  if (_db) return _db;
  if (process.env.DB_PROVIDER !== 'sqlite') {
    throw new Error('getSqliteDb()는 DB_PROVIDER=sqlite 환경에서만 사용할 수 있습니다.');
  }
  const { db, raw } = createSqliteConnection(getSqlitePath());
  _db = db;
  _raw = raw;
  return _db;
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
}
