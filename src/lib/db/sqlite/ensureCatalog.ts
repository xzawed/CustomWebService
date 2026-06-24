import { eq, ne, and, or, inArray } from 'drizzle-orm';
import type { SqliteDb } from './connection';
import * as schema from './schema';
import catalogData from '@/data/apiCatalog.json';

/**
 * 카탈로그 멱등 동기화 — 이미 시드된 프로덕션 DB에 신규/정정을 반영한다.
 *
 * `seedCatalog`는 "빈 테이블일 때만" 일괄 삽입하므로, 이미 채워진 프로덕션에는
 * 번들 JSON(`src/data/apiCatalog.json`)에 추가된 신규 항목이 반영되지 않는다.
 * 이 함수는 부팅 시 `seedCatalog` 다음에 실행되어 다음을 멱등하게 수행한다:
 *  1) JSON에 있으나 DB에 없는(id 기준) 항목만 삽입한다(기존 행은 절대 덮어쓰지 않음).
 *  2) 라이브로 동작하지만 broken/비활성으로 잘못 기록된 키리스 API를 정정한다
 *     (Dog API, Lorem Picsum → is_active=true, verification_status=verified).
 *     이미 올바른 상태면 갱신하지 않는다(향후 헬스체크 갱신과 충돌 최소화).
 *
 * 멱등: 두 번째 호출부턴 inserted=0, corrected=0.
 */
const CORRECTIONS = ['Dog API', 'Lorem Picsum'];

export function ensureCatalogEntries(db: SqliteDb): { inserted: number; corrected: number } {
  const rows = catalogData as unknown as (typeof schema.apiCatalog.$inferInsert)[];

  const existingIds = new Set(
    db
      .select({ id: schema.apiCatalog.id })
      .from(schema.apiCatalog)
      .all()
      .map((r) => r.id),
  );
  const missing = rows.filter((r) => typeof r.id === 'string' && !existingIds.has(r.id));
  if (missing.length > 0) {
    db.insert(schema.apiCatalog).values(missing).run();
  }

  const res = db
    .update(schema.apiCatalog)
    .set({ is_active: true, verification_status: 'verified' })
    .where(
      and(
        inArray(schema.apiCatalog.name, CORRECTIONS),
        or(
          eq(schema.apiCatalog.is_active, false),
          ne(schema.apiCatalog.verification_status, 'verified'),
        ),
      ),
    )
    .run();

  return { inserted: missing.length, corrected: res.changes ?? 0 };
}
