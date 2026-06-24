import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { createSqliteConnection, runSqliteMigrations, type SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import { ensureCatalogEntries } from './ensureCatalog';
import catalogData from '@/data/apiCatalog.json';

type InsertRow = typeof schema.apiCatalog.$inferInsert;
const rows = catalogData as unknown as InsertRow[];

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

  it('이미 verified·active면 정정하지 않는다 (corrected=0)', () => {
    ensureCatalogEntries(db); // 번들 JSON의 Dog/Lorem은 이미 verified+active로 삽입됨
    const r = ensureCatalogEntries(db);
    expect(r.corrected).toBe(0);
  });
});
