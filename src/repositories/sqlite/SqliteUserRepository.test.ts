import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createSqliteConnection, runSqliteMigrations, type SqliteDb } from '@/lib/db/sqlite/connection';
import { SqliteUserRepository } from './SqliteUserRepository';
import type { User } from '@/types/user';

/**
 * SqliteUserRepository 단위 테스트 — :memory: DB로 격리.
 * 각 테스트마다 새 연결 + 마이그레이션 적용, afterEach에서 raw.close().
 */
describe('SqliteUserRepository', () => {
  let db: SqliteDb;
  let raw: Database.Database;
  let repo: SqliteUserRepository;

  beforeEach(() => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    runSqliteMigrations(db);
    repo = new SqliteUserRepository(db);
  });

  afterEach(() => {
    raw.close();
  });

  const baseInput: Omit<User, 'id' | 'createdAt' | 'updatedAt'> = {
    email: 'admin@example.com',
    name: 'Admin',
    avatarUrl: 'https://example.com/a.png',
    preferences: { language: 'ko', theme: 'dark' },
    passwordHash: null,
    emailVerified: null,
  };

  describe('create', () => {
    it('새 유저를 생성하고 도메인 shape으로 반환한다', () => {
      return repo.create(baseInput).then((user) => {
        expect(user.id).toBeTruthy();
        expect(user.email).toBe('admin@example.com');
        expect(user.name).toBe('Admin');
        expect(user.avatarUrl).toBe('https://example.com/a.png');
        expect(user.preferences).toEqual({ language: 'ko', theme: 'dark' });
        // 타임스탬프는 ISO 문자열로 채워진다
        expect(typeof user.createdAt).toBe('string');
        expect(typeof user.updatedAt).toBe('string');
        expect(() => new Date(user.createdAt).toISOString()).not.toThrow();
      });
    });

    it('nullable 필드(name/avatarUrl 없음)와 빈 preferences를 처리한다', async () => {
      const user = await repo.create({
        email: 'minimal@example.com',
        name: null,
        avatarUrl: null,
        preferences: {},
        passwordHash: null,
        emailVerified: null,
      });
      expect(user.name).toBeNull();
      expect(user.avatarUrl).toBeNull();
      expect(user.preferences).toEqual({});
    });

    it('preferences가 null로 저장돼도 도메인에서는 {}로 폴백한다', async () => {
      // drizzle은 json 컬럼이 비어 있으면 null을 돌려주므로 매퍼 폴백을 검증
      const raw2 = raw;
      raw2
        .prepare(
          'INSERT INTO users (id, email, preferences, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)',
        )
        .run('fixed-id-1', 'nullpref@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

      const user = await repo.findById('fixed-id-1');
      expect(user).not.toBeNull();
      expect(user?.preferences).toEqual({});
      expect(user?.name).toBeNull();
      expect(user?.avatarUrl).toBeNull();
    });
  });

  describe('createWithAuthId', () => {
    it('지정한 authId를 PK로 사용해 생성한다', async () => {
      const user = await repo.createWithAuthId('auth-uuid-123', baseInput);
      expect(user.id).toBe('auth-uuid-123');
      expect(user.email).toBe('admin@example.com');

      const fetched = await repo.findById('auth-uuid-123');
      expect(fetched?.id).toBe('auth-uuid-123');
    });
  });

  describe('findById', () => {
    it('존재하는 유저를 반환한다', async () => {
      const created = await repo.create(baseInput);
      const found = await repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.email).toBe('admin@example.com');
    });

    it('없는 id면 null을 반환한다', async () => {
      const found = await repo.findById('does-not-exist');
      expect(found).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('이메일로 유저를 조회한다', async () => {
      await repo.create(baseInput);
      const found = await repo.findByEmail('admin@example.com');
      expect(found).not.toBeNull();
      expect(found?.email).toBe('admin@example.com');
    });

    it('없는 이메일이면 null을 반환한다', async () => {
      const found = await repo.findByEmail('missing@example.com');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('필드를 갱신하고 updated_at을 새로 채운다', async () => {
      const created = await repo.create(baseInput);

      const updated = await repo.update(created.id, {
        name: 'New Name',
        avatarUrl: 'https://example.com/b.png',
        preferences: { language: 'en', emailNotifications: true },
      });

      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe('New Name');
      expect(updated.avatarUrl).toBe('https://example.com/b.png');
      expect(updated.preferences).toEqual({ language: 'en', emailNotifications: true });
      expect(updated.email).toBe('admin@example.com'); // 변경 안 한 필드 보존

      const refetched = await repo.findById(created.id);
      expect(refetched?.name).toBe('New Name');
    });

    it('email만 부분 갱신할 수 있다', async () => {
      const created = await repo.create(baseInput);
      const updated = await repo.update(created.id, { email: 'changed@example.com' });
      expect(updated.email).toBe('changed@example.com');
      expect(updated.name).toBe('Admin');
    });
  });

  describe('delete', () => {
    it('유저를 삭제한다', async () => {
      const created = await repo.create(baseInput);
      await repo.delete(created.id);
      const found = await repo.findById(created.id);
      expect(found).toBeNull();
    });

    it('없는 id 삭제는 에러 없이 통과한다', async () => {
      await expect(repo.delete('nope')).resolves.toBeUndefined();
    });
  });

  describe('findMany', () => {
    beforeEach(async () => {
      // 3명 생성 (created_at 순서를 분리하기 위해 명시적 ISO 주입은 raw 사용)
      raw
        .prepare('INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run('u1', 'a@example.com', 'Alpha', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      raw
        .prepare('INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run('u2', 'b@example.com', 'Bravo', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
      raw
        .prepare('INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run('u3', 'c@example.com', 'Charlie', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z');
    });

    it('전체를 created_at desc(기본)로 반환하고 total을 채운다', async () => {
      const { items, total } = await repo.findMany();
      expect(total).toBe(3);
      expect(items).toHaveLength(3);
      // 기본 desc → 가장 최신(u3)이 먼저
      expect(items[0].id).toBe('u3');
      expect(items[2].id).toBe('u1');
    });

    it('orderDirection asc로 정렬한다', async () => {
      const { items } = await repo.findMany(undefined, { orderDirection: 'asc' });
      expect(items[0].id).toBe('u1');
      expect(items[2].id).toBe('u3');
    });

    it('페이지네이션(limit/page)을 적용한다', async () => {
      const page1 = await repo.findMany(undefined, { page: 1, limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(3);

      const page2 = await repo.findMany(undefined, { page: 2, limit: 2 });
      expect(page2.items).toHaveLength(1);
      expect(page2.total).toBe(3);
    });

    it('filter(email)로 좁힌다', async () => {
      const { items, total } = await repo.findMany({ email: 'b@example.com' });
      expect(total).toBe(1);
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('u2');
    });

    it('매칭이 없으면 빈 배열과 total 0을 반환한다', async () => {
      const { items, total } = await repo.findMany({ email: 'none@example.com' });
      expect(items).toEqual([]);
      expect(total).toBe(0);
    });
  });

  describe('auth fields', () => {
    it('passwordHash와 emailVerified를 저장·반환한다', async () => {
      const created = await repo.create({
        ...baseInput,
        passwordHash: 'salt:deadbeef',
        emailVerified: null,
      });
      expect(created.passwordHash).toBe('salt:deadbeef');
      expect(created.emailVerified).toBeNull();

      const fetched = await repo.findByEmail('admin@example.com');
      expect(fetched?.passwordHash).toBe('salt:deadbeef');
      expect(fetched?.emailVerified).toBeNull();
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      await repo.create({ email: 'x@example.com', name: null, avatarUrl: null, preferences: {}, passwordHash: null, emailVerified: null });
      await repo.create({ email: 'y@example.com', name: null, avatarUrl: null, preferences: {}, passwordHash: null, emailVerified: null });
    });

    it('필터 없이 전체 수를 센다', async () => {
      expect(await repo.count()).toBe(2);
    });

    it('filter에 맞는 수를 센다', async () => {
      expect(await repo.count({ email: 'x@example.com' })).toBe(1);
      expect(await repo.count({ email: 'nope@example.com' })).toBe(0);
    });

    it('빈 테이블이면 0을 반환한다', async () => {
      const conn = createSqliteConnection(':memory:');
      runSqliteMigrations(conn.db);
      const emptyRepo = new SqliteUserRepository(conn.db);
      expect(await emptyRepo.count()).toBe(0);
      conn.raw.close();
    });
  });
});
