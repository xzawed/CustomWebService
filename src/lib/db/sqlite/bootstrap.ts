import { runSqliteMigrations, type SqliteDb } from './connection';
import { seedCatalog, seedFeatureFlags } from './seedCatalog';

/** SQLite 부팅 부트스트랩. 마이그레이션 후 카탈로그·플래그를 멱등 시드한다(관리자 시드 제거 — 공개 회원가입). */
export function bootstrapSqlite(db: SqliteDb): void {
  runSqliteMigrations(db);
  seedCatalog(db);
  seedFeatureFlags(db);
}
