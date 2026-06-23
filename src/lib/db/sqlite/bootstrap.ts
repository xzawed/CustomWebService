import { runSqliteMigrations, type SqliteDb } from './connection';
import { seedAdminUser } from './seedAdmin';

/**
 * SQLite 부팅 부트스트랩 (DB_PROVIDER=sqlite 경로, instrumentation에서 호출).
 *
 * 순서가 중요하다: 마이그레이션으로 테이블을 먼저 만든 뒤 관리자 행을 시드한다.
 * 둘 다 멱등이므로 재배포·재시작 시 안전하게 반복 호출된다.
 */
export function bootstrapSqlite(db: SqliteDb): void {
  runSqliteMigrations(db);
  seedAdminUser(db);
}
