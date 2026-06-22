import { describe, it, expect, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type DatabaseType from 'better-sqlite3';
import { createSqliteConnection, runSqliteMigrations } from './connection';
import * as schema from './schema';

let raw: DatabaseType.Database | undefined;

afterEach(() => {
  raw?.close();
  raw = undefined;
});

function freshDb() {
  const conn = createSqliteConnection(':memory:');
  raw = conn.raw;
  runSqliteMigrations(conn.db);
  return conn.db;
}

describe('createSqliteConnection', () => {
  it('권장 pragma(foreign_keys·busy_timeout)를 적용한다', () => {
    const conn = createSqliteConnection(':memory:');
    raw = conn.raw;
    expect(conn.raw.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(conn.raw.pragma('busy_timeout', { simple: true })).toBe(5000);
  });
});

describe('SQLite 스키마 round-trip', () => {
  it('boolean·json·배열·timestamp·기본값이 왕복한다', () => {
    const db = freshDb();

    const [u] = db
      .insert(schema.users)
      .values({ email: 'admin@example.com', name: 'Admin', preferences: { theme: 'dark' } })
      .returning()
      .all();
    expect(u.id).toBeTruthy();
    expect(u.preferences).toEqual({ theme: 'dark' });
    expect(u.created_at).toBeTruthy();

    const [api] = db
      .insert(schema.apiCatalog)
      .values({ name: 'Test API', is_active: true, tags: ['a', 'b'], endpoints: [{ path: '/x' }] })
      .returning()
      .all();
    expect(api.is_active).toBe(true); // integer(mode:boolean) → boolean
    expect(api.tags).toEqual(['a', 'b']); // text(mode:json) array
    expect(api.endpoints).toEqual([{ path: '/x' }]);
    expect(api.verification_status).toBe('unverified'); // 스칼라 기본값

    const [p] = db.insert(schema.projects).values({ user_id: u.id, name: 'P1' }).returning().all();
    expect(p.status).toBe('draft'); // 기본값
    expect(p.current_version).toBe(0);

    const found = db.select().from(schema.projects).where(eq(schema.projects.id, p.id)).all();
    expect(found).toHaveLength(1);
  });

  it('foreign_keys 제약을 강제한다 (존재하지 않는 user_id)', () => {
    const db = freshDb();
    expect(() =>
      db.insert(schema.projects).values({ user_id: 'nonexistent', name: 'X' }).run(),
    ).toThrow();
  });

  it('UNIQUE 제약을 강제한다 (generated_codes project_id+version)', () => {
    const db = freshDb();
    const [u] = db.insert(schema.users).values({ email: 'u@x.com' }).returning().all();
    const [p] = db.insert(schema.projects).values({ user_id: u.id, name: 'P' }).returning().all();
    db.insert(schema.generatedCodes).values({ project_id: p.id, version: 1 }).run();
    expect(() =>
      db.insert(schema.generatedCodes).values({ project_id: p.id, version: 1 }).run(),
    ).toThrow();
  });
});
