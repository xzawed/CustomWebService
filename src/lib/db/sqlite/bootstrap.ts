import { runSqliteMigrations, type SqliteDb } from './connection';
import { seedCatalog, seedFeatureFlags } from './seedCatalog';
import { ensureCatalogEntries } from './ensureCatalog';
import { ensureFeatureFlags } from './ensureFeatureFlags';

/**
 * SQLite 부팅 부트스트랩. 마이그레이션 후 카탈로그·플래그를 멱등 시드한다(관리자 시드 제거 — 공개 회원가입).
 *
 * `seed*`는 **빈 테이블일 때만** 동작하므로, 이미 채워진 프로덕션에는 `ensure*`가 필요하다:
 * - `ensureCatalogEntries` — 번들 JSON의 신규/정정 항목을 멱등 반영
 * - `ensureFeatureFlags` — 신규 플래그 삽입 + **화이트리스트 밖 죽은 플래그 제거**
 */
export function bootstrapSqlite(db: SqliteDb): void {
  runSqliteMigrations(db);
  seedCatalog(db);
  seedFeatureFlags(db);
  ensureCatalogEntries(db);
  ensureFeatureFlags(db);
}
