import { notInArray } from 'drizzle-orm';
import type { SqliteDb } from './connection';
import * as schema from './schema';
import flagsData from '@/data/featureFlags.json';
import { logger } from '@/lib/utils/logger';

/**
 * feature_flags 멱등 동기화 — 이미 시드된 프로덕션 DB에 신규 플래그를 반영하고,
 * **소비 코드가 0건인 죽은 플래그를 제거**한다.
 *
 * `seedFeatureFlags`는 "빈 테이블일 때만" 삽입하므로 프로덕션에는 2026-05 시절의
 * 7행이 그대로 남아 있다. 그 7행은 전부 (a) 구현이 존재하지 않는 기능이거나
 * (b) 이미 무조건 켜져 있는 기능이라 아무도 읽지 않았고, 그중
 * `enable_template_system=false`는 **실제로 살아 있는 템플릿 시스템과 정반대**였다.
 * 남겨 두면 나중에 누군가 그 값을 믿고 배선해 동작하는 기능을 끄게 된다.
 *
 * 멱등: 두 번째 호출부턴 inserted=0, removed=0.
 */
export function ensureFeatureFlags(db: SqliteDb): { inserted: number; removed: number } {
  const rows = flagsData as unknown as (typeof schema.featureFlags.$inferInsert)[];
  const keepNames = rows.map((r) => r.flag_name);

  const existing = new Set(
    db
      .select({ name: schema.featureFlags.flag_name })
      .from(schema.featureFlags)
      .all()
      .map((r) => r.name),
  );

  const missing = rows.filter((r) => !existing.has(r.flag_name));
  if (missing.length > 0) {
    db.insert(schema.featureFlags).values(missing).run();
  }

  // 화이트리스트 밖은 전부 제거한다. 이름을 하드코딩해 두면 다음에 죽은 플래그가
  // 늘어날 때 또 목록을 손봐야 하고, 빠뜨리면 그대로 남는다.
  const removed =
    keepNames.length > 0
      ? (db
          .delete(schema.featureFlags)
          .where(notInArray(schema.featureFlags.flag_name, keepNames))
          .run().changes ?? 0)
      : 0;

  if (missing.length > 0 || removed > 0) {
    logger.info('Feature flags synced', {
      inserted: missing.length,
      removed,
      keep: keepNames,
    });
  }

  return { inserted: missing.length, removed };
}

/** 번들 JSON이 정의하는 "살아 있는 플래그" 이름 목록. 화이트리스트의 단일 출처다. */
export function listSeededFlagNames(): string[] {
  return (flagsData as unknown as { flag_name: string }[]).map((r) => r.flag_name);
}
