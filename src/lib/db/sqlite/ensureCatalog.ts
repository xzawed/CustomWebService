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
 *  3) id 화이트리스트의 **구조 필드만** 번들 JSON과 맞춘다
 *     (`base_url` · `endpoints` · `deprecated_at` · `description`).
 *
 * 멱등: 두 번째 호출부턴 inserted=0, corrected=0.
 */
const CORRECTIONS = ['Dog API', 'Lorem Picsum'];

/**
 * data.go.kr 등 구조 정정이 필요한 카탈로그 id 목록(명시·최소).
 * 값은 번들 JSON에서 읽어 오며, 전체 테이블 덮어쓰기는 하지 않는다.
 *
 * ⚠️ is_active·verification_status 는 절대 건드리지 않는다.
 * 재배포가 is_active를 덮어쓰면 오퍼레이터의 활성/비활성 판단이 조용히 롤백된다.
 * ensureFeatureFlags가 기존 행의 enabled를 덮어쓰지 않는 것과 같은 전례.
 */
const STRUCTURAL_PATCH_IDS: readonly string[] = [
  'c76876b5-a4d8-49cf-a0c9-0240daf3eb5e', // 한국관광공사 TourAPI → KorService2
  '7cb8f428-e284-4eee-944a-af47274662d2', // 기상청 단기예보 (example_call·파라미터 제약)
  '00412c2b-6c17-4b23-9a3d-46b7004285e4', // 기상청 중기예보 (tmFc 과거 슬롯)
  'c84860a1-336c-45f1-b1df-00f25bd810bd', // 에어코리아 (returnType·pageNo 필수)
  '17665554-5a7c-4df0-91a7-826dab855f05', // 국토부 아파트 전월세 (XML 전용)
  'f45de6c5-95e6-4c4a-989e-c60b060a9c7c', // 식약처 식품영양성분 (폐기)
];

type CatalogSeedRow = typeof schema.apiCatalog.$inferInsert;

type StructuralFields = {
  base_url: string | null;
  endpoints: unknown[] | null;
  deprecated_at: string | null;
  description: string | null;
};

function pickStructural(row: CatalogSeedRow): StructuralFields {
  return {
    base_url: row.base_url ?? null,
    endpoints: (row.endpoints as unknown[] | null | undefined) ?? null,
    deprecated_at: row.deprecated_at ?? null,
    description: row.description ?? null,
  };
}

function sameStructural(
  desired: StructuralFields,
  current: {
    base_url: string | null;
    endpoints: unknown;
    deprecated_at: string | null;
    description: string | null;
  },
): boolean {
  return (
    (desired.base_url ?? null) === (current.base_url ?? null) &&
    (desired.deprecated_at ?? null) === (current.deprecated_at ?? null) &&
    (desired.description ?? null) === (current.description ?? null) &&
    JSON.stringify(desired.endpoints ?? null) === JSON.stringify(current.endpoints ?? null)
  );
}

/**
 * STRUCTURAL_PATCH_IDS 대상 행의 구조 필드만 번들과 동기화한다.
 * is_active / verification_status 는 읽지도·쓰지도 않는다.
 */
function applyStructuralPatches(db: SqliteDb, rows: CatalogSeedRow[]): number {
  const byId = new Map(rows.filter((r) => typeof r.id === 'string').map((r) => [r.id as string, r]));
  let patched = 0;

  for (const id of STRUCTURAL_PATCH_IDS) {
    const seed = byId.get(id);
    if (!seed) continue;

    const current = db
      .select({
        base_url: schema.apiCatalog.base_url,
        endpoints: schema.apiCatalog.endpoints,
        deprecated_at: schema.apiCatalog.deprecated_at,
        description: schema.apiCatalog.description,
      })
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.id, id))
      .get();
    if (!current) continue;

    const desired = pickStructural(seed);
    if (sameStructural(desired, current)) continue;

    // is_active·verification_status 를 set에 넣지 않는다 — 오퍼레이터 판단을 보존.
    db.update(schema.apiCatalog)
      .set({
        base_url: desired.base_url,
        endpoints: desired.endpoints,
        deprecated_at: desired.deprecated_at,
        description: desired.description,
      })
      .where(eq(schema.apiCatalog.id, id))
      .run();
    patched += 1;
  }

  return patched;
}

export function ensureCatalogEntries(db: SqliteDb): { inserted: number; corrected: number } {
  const rows = catalogData as unknown as CatalogSeedRow[];

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

  const nameCorrected = res.changes ?? 0;
  const structuralCorrected = applyStructuralPatches(db, rows);

  return { inserted: missing.length, corrected: nameCorrected + structuralCorrected };
}

/** 테스트·문서용: 구조 패치 대상 id 목록 */
export function listStructuralPatchIds(): readonly string[] {
  return STRUCTURAL_PATCH_IDS;
}
