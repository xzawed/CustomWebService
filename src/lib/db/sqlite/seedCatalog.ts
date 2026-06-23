import { sql } from 'drizzle-orm';
import type { SqliteDb } from './connection';
import * as schema from './schema';
import catalogData from '@/data/apiCatalog.json';
import featureFlagsData from '@/data/featureFlags.json';

/**
 * API 카탈로그/피처 플래그를 번들된 시드 데이터(`src/data/*.json`)로 SQLite에 시드한다
 * (DB_PROVIDER=sqlite 부팅 경로). 데이터는 프로덕션 `api_catalog`/`feature_flags`를
 * 미러링한 생성 산출물이며 `scripts/generateSqliteSeed.ts`로 재생성한다.
 *
 * 멱등: 테이블이 비어 있을 때만 일괄 삽입한다(이미 시드/cron 갱신된 행은 보존).
 * id·created_at 등은 프로덕션 값을 그대로 유지해 환경 간 일관성(project_apis FK)을 보장한다.
 */
export function seedCatalog(db: SqliteDb): number {
  const existing = db.select({ c: sql<number>`count(*)` }).from(schema.apiCatalog).get();
  if ((existing?.c ?? 0) > 0) return 0;

  const rows = catalogData as unknown as (typeof schema.apiCatalog.$inferInsert)[];
  if (rows.length === 0) return 0;
  db.insert(schema.apiCatalog).values(rows).run();
  return rows.length;
}

export function seedFeatureFlags(db: SqliteDb): number {
  const existing = db.select({ c: sql<number>`count(*)` }).from(schema.featureFlags).get();
  if ((existing?.c ?? 0) > 0) return 0;

  const rows = featureFlagsData as unknown as (typeof schema.featureFlags.$inferInsert)[];
  if (rows.length === 0) return 0;
  db.insert(schema.featureFlags).values(rows).run();
  return rows.length;
}
