import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { createSqliteConnection, runSqliteMigrations, type SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import { ensureCatalogEntries, listStructuralPatchIds } from './ensureCatalog';
import catalogData from '@/data/apiCatalog.json';

type InsertRow = typeof schema.apiCatalog.$inferInsert;
const rows = catalogData as unknown as InsertRow[];

const TOUR_API_ID = 'c76876b5-a4d8-49cf-a0c9-0240daf3eb5e';
const FOOD_NTR_ID = 'f45de6c5-95e6-4c4a-989e-c60b060a9c7c';

describe('ensureCatalogEntries', () => {
  let db: SqliteDb;
  let raw: Database.Database;

  beforeEach(() => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    runSqliteMigrations(db);
  });
  afterEach(() => raw.close());

  it('빈 DB엔 번들 전체를 삽입하고, 재실행하면 멱등(0 삽입)이다', () => {
    const r1 = ensureCatalogEntries(db);
    expect(r1.inserted).toBe(rows.length);
    expect(db.select().from(schema.apiCatalog).all().length).toBe(rows.length);

    const r2 = ensureCatalogEntries(db);
    expect(r2.inserted).toBe(0);
  });

  it('일부 항목만 이미 있으면 누락분만 삽입한다 (기존 행 보존)', () => {
    db.insert(schema.apiCatalog).values(rows[0]).run();
    const r = ensureCatalogEntries(db);
    expect(r.inserted).toBe(rows.length - 1);
    expect(db.select().from(schema.apiCatalog).all().length).toBe(rows.length);
  });

  it('Dog API가 broken·비활성으로 기록돼 있으면 verified·active로 정정한다', () => {
    const dog = rows.find((x) => x.name === 'Dog API')!;
    db.insert(schema.apiCatalog)
      .values({ ...dog, is_active: false, verification_status: 'broken' })
      .run();

    const r = ensureCatalogEntries(db);
    expect(r.corrected).toBeGreaterThanOrEqual(1);

    const row = db
      .select()
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.name, 'Dog API'))
      .get();
    expect(row?.is_active).toBe(true);
    expect(row?.verification_status).toBe('verified');
  });

  it('이미 verified·active면 이름 정정하지 않는다 (corrected=0, 구조도 일치)', () => {
    ensureCatalogEntries(db); // 번들 JSON 전체가 올바른 상태로 삽입됨
    const r = ensureCatalogEntries(db);
    expect(r.corrected).toBe(0);
  });

  it('구조 패치: 구 base_url이면 첫 부팅에 반영하고 두 번째 부팅은 no-op', () => {
    const tour = rows.find((x) => x.id === TOUR_API_ID)!;
    db.insert(schema.apiCatalog)
      .values({
        ...tour,
        base_url: 'https://apis.data.go.kr/B551011/KorService1',
        endpoints: [{ path: '/areaBasedList1', method: 'GET' }],
        description: '구 설명',
      })
      .run();

    const r1 = ensureCatalogEntries(db);
    expect(r1.corrected).toBeGreaterThanOrEqual(1);

    const after = db
      .select()
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.id, TOUR_API_ID))
      .get();
    expect(after?.base_url).toBe(tour.base_url);
    expect(after?.description).toBe(tour.description);
    expect(JSON.stringify(after?.endpoints)).toBe(JSON.stringify(tour.endpoints));

    const r2 = ensureCatalogEntries(db);
    expect(r2.corrected).toBe(0);
  });

  it('구조 패치가 is_active·verification_status를 덮어쓰지 않는다 — 재배포가 오퍼레이터 판단을 롤백하면 안 됨', () => {
    const tour = rows.find((x) => x.id === TOUR_API_ID)!;
    // 번들 JSON의 TourAPI는 is_active:false / unverified 이지만,
    // 오퍼레이터가 활성화·verified로 둔 상태를 재배포가 되돌려서는 안 된다.
    db.insert(schema.apiCatalog)
      .values({
        ...tour,
        base_url: 'https://apis.data.go.kr/B551011/KorService1',
        is_active: true,
        verification_status: 'verified',
      })
      .run();

    ensureCatalogEntries(db);

    const after = db
      .select()
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.id, TOUR_API_ID))
      .get();
    expect(after?.base_url).toBe(tour.base_url);
    expect(after?.is_active).toBe(true);
    expect(after?.verification_status).toBe('verified');
  });

  it('폐기 항목(식약처)의 deprecated_at만 반영하고 is_active는 보존한다', () => {
    const food = rows.find((x) => x.id === FOOD_NTR_ID)!;
    db.insert(schema.apiCatalog)
      .values({
        ...food,
        deprecated_at: null,
        description: '구 설명',
        is_active: true, // 번들은 false — 구조 패치가 이걸 건드리면 회귀
        verification_status: 'broken',
      })
      .run();

    ensureCatalogEntries(db);

    const after = db
      .select()
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.id, FOOD_NTR_ID))
      .get();
    expect(after?.deprecated_at).toBe('2026-08-05T00:00:00.000Z');
    expect(after?.description).toBe(food.description);
    expect(after?.is_active).toBe(true);
    expect(after?.verification_status).toBe('broken');
  });
});

describe('apiCatalog data.go.kr 구조 정정 (시드 데이터 회귀 방지)', () => {
  it('6개 대상 항목이 기대 base_url·example_call·deprecated_at 을 갖는다', () => {
    const byId = new Map(
      (catalogData as { id: string }[]).map((r) => [r.id, r as Record<string, unknown>]),
    );

    expect(listStructuralPatchIds()).toHaveLength(6);

    const tour = byId.get(TOUR_API_ID)!;
    expect(tour.base_url).toBe('https://apis.data.go.kr/B551011/KorService2');
    const tourEndpoints = tour.endpoints as { path: string; example_call?: string }[];
    expect(tourEndpoints.map((e) => e.path)).toEqual(['/areaBasedList2', '/searchKeyword2']);
    expect(tourEndpoints[0]?.example_call).toContain('MobileOS=ETC');
    expect(tourEndpoints[0]?.example_call).toContain('_type=json');
    expect(tourEndpoints[1]?.example_call).toContain('keyword=경복궁');

    const shortFcst = byId.get('7cb8f428-e284-4eee-944a-af47274662d2')!;
    const shortEp = (shortFcst.endpoints as { example_call?: string; responseDataPath?: string }[])[0];
    expect(shortEp?.example_call).toBe(
      '/getVilageFcst?nx=60&ny=127&base_date=20260804&base_time=0500&dataType=JSON&pageNo=1&numOfRows=1000',
    );
    expect(shortEp?.responseDataPath).toBe('response.body.items.item');

    const midFcst = byId.get('00412c2b-6c17-4b23-9a3d-46b7004285e4')!;
    const midEp = (midFcst.endpoints as { example_call?: string; responseDataPath?: string }[])[0];
    expect(midEp?.example_call).toBe(
      '/getMidTa?regId=11B10101&tmFc=202608040600&dataType=JSON&pageNo=1&numOfRows=10',
    );
    expect(midEp?.responseDataPath).toBe('response.body.items.item');

    const air = byId.get('c84860a1-336c-45f1-b1df-00f25bd810bd')!;
    const airEp = (air.endpoints as { example_call?: string; responseDataPath?: string }[])[0];
    expect(airEp?.example_call).toBe(
      '/getMsrstnAcctoRltmMesureDnsty?stationName=종로구&dataTerm=DAILY&returnType=json&ver=1.0&pageNo=1&numOfRows=10',
    );
    expect(airEp?.responseDataPath).toBe('response.body.items');

    const molit = byId.get('17665554-5a7c-4df0-91a7-826dab855f05')!;
    expect(String(molit.description)).toMatch(/XML/);
    const molitEp = (molit.endpoints as { example_call?: string }[])[0];
    expect(molitEp?.example_call).toBe(
      '/getRTMSDataSvcAptRent?LAWD_CD=11680&DEAL_YMD=202607&pageNo=1&numOfRows=10',
    );

    const food = byId.get(FOOD_NTR_ID)!;
    expect(food.deprecated_at).toBe('2026-08-05T00:00:00.000Z');
    expect(food.successor_id).toBeNull();
    expect(food.is_active).toBe(false);
    expect(String(food.description)).toMatch(/폐기|code 12|대체/);
  });
});
