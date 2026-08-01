import { describe, it, expect, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type DatabaseType from 'better-sqlite3';
import { logger } from '@/lib/utils/logger';
import {
  createSqliteConnection,
  runSqliteMigrations,
  getSqliteDb,
  getSqliteRawConnection,
  resetSqliteConnection,
} from './connection';
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
});

describe('getSqliteRawConnection', () => {
  const prevProvider = process.env.DB_PROVIDER;
  const prevPath = process.env.SQLITE_PATH;

  afterEach(() => {
    resetSqliteConnection();
    if (prevProvider === undefined) delete process.env.DB_PROVIDER;
    else process.env.DB_PROVIDER = prevProvider;
    if (prevPath === undefined) delete process.env.SQLITE_PATH;
    else process.env.SQLITE_PATH = prevPath;
  });

  it('returns the better-sqlite3 connection backing the singleton', () => {
    process.env.DB_PROVIDER = 'sqlite';
    process.env.SQLITE_PATH = ':memory:';
    getSqliteDb();

    const conn = getSqliteRawConnection();
    expect(conn.open).toBe(true);
    expect(conn.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('initializes the singleton on first access if not yet created', () => {
    process.env.DB_PROVIDER = 'sqlite';
    process.env.SQLITE_PATH = ':memory:';

    const conn = getSqliteRawConnection();
    expect(conn.open).toBe(true);
  });

  // DB_PROVIDER 게이트 (WBS C5). 과거엔 미설정이면 무조건 throw라, env 문자열 하나를 잃으면
  // 모든 DB 접근이 죽었다. 단일 스택이므로 미설정은 sqlite로 취급하되, 잘못된 값과
  // 테스트 경로 누락은 계속 막는다.
  it('DB_PROVIDER 미설정이어도 sqlite로 연결한다 (env 하나로 전면 장애가 나지 않는다)', () => {
    delete process.env.DB_PROVIDER;
    process.env.SQLITE_PATH = ':memory:';

    const conn = getSqliteRawConnection();
    expect(conn.open).toBe(true);
  });

  it('미설정으로 연결하면 경고를 남긴다 — 조용히 넘어가면 왜 기본값으로 떴는지 알 수 없다', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    try {
      delete process.env.DB_PROVIDER;
      process.env.SQLITE_PATH = ':memory:';

      getSqliteDb();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/DB_PROVIDER/);
    } finally {
      warn.mockRestore();
    }
  });

  it('DB_PROVIDER 빈 문자열도 미설정과 같게 취급한다', () => {
    process.env.DB_PROVIDER = '';
    process.env.SQLITE_PATH = ':memory:';

    expect(getSqliteRawConnection().open).toBe(true);
  });

  it('지원하지 않는 DB_PROVIDER 값은 값을 담아 throw한다 (오설정을 삼키지 않는다)', () => {
    process.env.DB_PROVIDER = 'postgres';
    process.env.SQLITE_PATH = ':memory:';

    expect(() => getSqliteDb()).toThrow(/postgres/);
  });

  // 이 테스트는 가드 자체와 함께 "vitest에서 NODE_ENV==='test'"라는 전제도 고정한다.
  // 전제가 깨지면 가드가 조용히 무력화되므로 여기서 빨갛게 드러나야 한다.
  it('테스트 환경에서 SQLITE_PATH가 없으면 throw한다 (실제 파일 DB 사고 방지)', () => {
    expect(process.env.NODE_ENV).toBe('test');
    delete process.env.DB_PROVIDER;
    delete process.env.SQLITE_PATH;

    expect(() => getSqliteDb()).toThrow(/SQLITE_PATH/);
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
