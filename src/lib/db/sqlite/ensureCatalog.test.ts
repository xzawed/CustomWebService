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
const DISEASE_SH_ID = 'bb29c4e4-e908-40f8-946a-6c9b9265fa6c';
const JIKAN_ID = '6c31e6c8-0c29-44d0-98cd-0fd579ab6cb6';
const OFF_ID = 'e0043eeb-749a-4890-94de-840d1a0c6164';
const ZENQUOTES_ID = '4c6f5228-e6ec-45bb-b0bb-e947dcdeb1c1';
const AIRKOREA_ID = 'c84860a1-336c-45f1-b1df-00f25bd810bd';

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

  it('구조 패치가 cache_ttl_seconds 를 번들과 동기화한다', () => {
    const zen = rows.find((x) => x.id === ZENQUOTES_ID)!;
    expect(zen.cache_ttl_seconds).toBe(120);

    db.insert(schema.apiCatalog)
      .values({
        ...zen,
        cache_ttl_seconds: null, // 프로덕션에 TTL 없던 상태
        description: '구 설명',
      })
      .run();

    const r1 = ensureCatalogEntries(db);
    expect(r1.corrected).toBeGreaterThanOrEqual(1);

    const after = db
      .select()
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.id, ZENQUOTES_ID))
      .get();
    expect(after?.cache_ttl_seconds).toBe(120);
    expect(after?.description).toBe(zen.description);

    const r2 = ensureCatalogEntries(db);
    expect(r2.corrected).toBe(0);
  });

  it('disease.sh: deprecated_at 반영 · is_active·verification_status 보존 (프록시 차단은 deactivate 2단계)', () => {
    const disease = rows.find((x) => x.id === DISEASE_SH_ID)!;
    expect(disease.deprecated_at).toBe('2026-08-05T00:00:00.000Z');
    expect(disease.is_active).toBe(false);

    db.insert(schema.apiCatalog)
      .values({
        ...disease,
        deprecated_at: null,
        description: '구 설명',
        is_active: true, // 아직 활성 — 구조 패치가 끄면 안 됨
        verification_status: 'verified',
      })
      .run();

    ensureCatalogEntries(db);

    const after = db
      .select()
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.id, DISEASE_SH_ID))
      .get();
    expect(after?.deprecated_at).toBe('2026-08-05T00:00:00.000Z');
    expect(after?.description).toBe(disease.description);
    // proxy/route.ts 는 isActive 만 본다 — 구조 패치가 true를 유지해야 2단계 폐기가 성립
    expect(after?.is_active).toBe(true);
    expect(after?.verification_status).toBe('verified');
  });

  it('Jikan 엔드포인트에서 /v4/top/anime 가 제거되고 구조 패치로 반영된다', () => {
    const jikan = rows.find((x) => x.id === JIKAN_ID)!;
    const paths = (jikan.endpoints as { path: string }[]).map((e) => e.path);
    expect(paths).not.toContain('/v4/top/anime');
    expect(paths).toEqual(['/v4/anime/1', '/v4/anime']);

    db.insert(schema.apiCatalog)
      .values({
        ...jikan,
        endpoints: [
          { path: '/v4/anime/1', method: 'GET' },
          { path: '/v4/anime', method: 'GET' },
          { path: '/v4/top/anime', method: 'GET' }, // 구 프로덕션 행
        ],
        description: '구 설명',
      })
      .run();

    ensureCatalogEntries(db);

    const after = db
      .select()
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.id, JIKAN_ID))
      .get();
    const afterPaths = (after?.endpoints as { path: string }[]).map((e) => e.path);
    expect(afterPaths).not.toContain('/v4/top/anime');
    expect(afterPaths).toEqual(['/v4/anime/1', '/v4/anime']);
  });

  it('Open Food Facts 엔드포인트에서 /cgi/search.pl 이 제거되고 구조 패치로 반영된다', () => {
    const off = rows.find((x) => x.id === OFF_ID)!;
    const paths = (off.endpoints as { path: string }[]).map((e) => e.path);
    expect(paths).not.toContain('/cgi/search.pl');
    expect(paths).toEqual(['/api/v2/product/737628064502.json']);

    db.insert(schema.apiCatalog)
      .values({
        ...off,
        endpoints: [
          { path: '/api/v2/product/737628064502.json', method: 'GET' },
          { path: '/cgi/search.pl', method: 'GET' },
        ],
        description: '구 설명',
      })
      .run();

    ensureCatalogEntries(db);

    const after = db
      .select()
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.id, OFF_ID))
      .get();
    const afterPaths = (after?.endpoints as { path: string }[]).map((e) => e.path);
    expect(afterPaths).not.toContain('/cgi/search.pl');
    expect(afterPaths).toEqual(['/api/v2/product/737628064502.json']);
  });
});

describe('apiCatalog 구조 정정 (시드 데이터 회귀 방지)', () => {
  it('구조 패치 대상 항목이 기대 base_url·endpoints·deprecated_at·cache_ttl 을 갖는다', () => {
    const byId = new Map(
      (catalogData as { id: string }[]).map((r) => [r.id, r as Record<string, unknown>]),
    );

    expect(listStructuralPatchIds()).toHaveLength(10);
    expect(listStructuralPatchIds()).toEqual(
      expect.arrayContaining([
        TOUR_API_ID,
        FOOD_NTR_ID,
        DISEASE_SH_ID,
        JIKAN_ID,
        OFF_ID,
        ZENQUOTES_ID,
        AIRKOREA_ID,
      ]),
    );

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

    const air = byId.get(AIRKOREA_ID)!;
    const airEp = (air.endpoints as { example_call?: string; responseDataPath?: string }[])[0];
    expect(airEp?.example_call).toBe(
      '/getMsrstnAcctoRltmMesureDnsty?stationName=종로구&dataTerm=DAILY&returnType=json&ver=1.0&pageNo=1&numOfRows=10',
    );
    expect(airEp?.responseDataPath).toBe('response.body.items');
    expect(air.cache_ttl_seconds).toBe(3600);

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

    const disease = byId.get(DISEASE_SH_ID)!;
    expect(disease.deprecated_at).toBe('2026-08-05T00:00:00.000Z');
    expect(disease.successor_id).toBeNull();
    expect(disease.is_active).toBe(false);
    expect(String(disease.description)).toMatch(/502|Cloudflare|폐기/);

    const jikan = byId.get(JIKAN_ID)!;
    expect((jikan.endpoints as { path: string }[]).map((e) => e.path)).toEqual([
      '/v4/anime/1',
      '/v4/anime',
    ]);
    expect(String(jikan.description)).toMatch(/top\/anime|504/);

    const off = byId.get(OFF_ID)!;
    expect((off.endpoints as { path: string }[]).map((e) => e.path)).toEqual([
      '/api/v2/product/737628064502.json',
    ]);
    expect(String(off.description)).toMatch(/search\.pl|503/);

    const zen = byId.get(ZENQUOTES_ID)!;
    expect(zen.cache_ttl_seconds).toBe(120);
    expect(String(zen.description)).toMatch(/429|캐시|TTL/);
  });

  it('apiCatalog 총 항목 수는 61 (행 삭제 없이 구조만 변경)', () => {
    expect((catalogData as unknown[]).length).toBe(61);
  });
});
