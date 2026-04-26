import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import { DrizzleUserRepository } from '@/repositories/drizzle/DrizzleUserRepository';

const NOW = new Date('2026-04-26T00:00:00.000Z');

function makeUserRow(overrides: Partial<typeof schema.users.$inferSelect> = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    name: null,
    avatar_url: null,
    emailVerified: null,
    image: null,
    preferences: {},
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  } as typeof schema.users.$inferSelect;
}

function makeMockDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  } as unknown as NodePgDatabase<typeof schema>;
}

describe('DrizzleUserRepository', () => {
  let mockDb: ReturnType<typeof makeMockDb>;
  let repo: DrizzleUserRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeMockDb();
    repo = new DrizzleUserRepository(mockDb);
  });

  // ─── findById ──────────────────────────────────────────────────────────────
  describe('findById()', () => {
    it('ID가 일치하는 사용자를 반환한다', async () => {
      const row = makeUserRow({ name: '홍길동', email: 'hong@example.com' });
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.findById('user-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('user-1');
      expect(result!.email).toBe('hong@example.com');
      expect(result!.name).toBe('홍길동');
    });

    it('존재하지 않으면 null을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await repo.findById('non-existent');
      expect(result).toBeNull();
    });

    it('toDomain이 nullable 필드를 기본값으로 매핑한다', async () => {
      const row = makeUserRow({ name: null, avatar_url: null, preferences: null as never });
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.findById('user-1');
      expect(result!.name).toBeNull();
      expect(result!.avatarUrl).toBeNull();
      expect(result!.preferences).toEqual({});
      expect(result!.createdAt).toBe(String(NOW));
      expect(result!.updatedAt).toBe(String(NOW));
    });
  });

  // ─── findMany ──────────────────────────────────────────────────────────────
  describe('findMany()', () => {
    it('사용자 목록과 total을 반환한다', async () => {
      const rows = [
        makeUserRow({ id: 'user-1' }),
        makeUserRow({ id: 'user-2', email: 'user2@example.com' }),
      ];

      vi.mocked(mockDb.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: 2 }]),
          }),
        } as never)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue(rows),
                }),
              }),
            }),
          }),
        } as never);

      const result = await repo.findMany();
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('user-1');
      expect(result.items[1].id).toBe('user-2');
    });

    it('결과가 없으면 빈 배열과 total 0을 반환한다', async () => {
      vi.mocked(mockDb.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: 0 }]),
          }),
        } as never)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as never);

      const result = await repo.findMany();
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────
  describe('create()', () => {
    it('사용자를 삽입하고 반환한다', async () => {
      const row = makeUserRow({ email: 'new@example.com' });
      const mockReturning = vi.fn().mockResolvedValue([row]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      const result = await repo.create({
        email: 'new@example.com',
        name: null,
        avatarUrl: null,
        preferences: {},
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result.email).toBe('new@example.com');
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────
  describe('update()', () => {
    it('사용자 정보를 업데이트하고 반환한다', async () => {
      const row = makeUserRow({ name: '수정된이름' });
      vi.mocked(mockDb.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.update('user-1', { name: '수정된이름' });
      expect(result.name).toBe('수정된이름');
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────
  describe('delete()', () => {
    it('사용자를 삭제한다', async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.delete).mockReturnValue({ where: mockWhere } as never);

      await repo.delete('user-1');
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  // ─── count ─────────────────────────────────────────────────────────────────
  describe('count()', () => {
    it('사용자 수를 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 7 }]),
        }),
      } as never);

      const result = await repo.count();
      expect(result).toBe(7);
    });

    it('결과가 없으면 0을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const result = await repo.count();
      expect(result).toBe(0);
    });
  });

  // ─── createWithAuthId ──────────────────────────────────────────────────────
  describe('createWithAuthId()', () => {
    it('authId를 id로 사용해 사용자를 생성한다', async () => {
      const row = makeUserRow({ id: 'auth-uuid-123', email: 'auth@example.com' });
      const mockReturning = vi.fn().mockResolvedValue([row]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      const result = await repo.createWithAuthId('auth-uuid-123', {
        email: 'auth@example.com',
        name: null,
        avatarUrl: null,
        preferences: {},
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result.id).toBe('auth-uuid-123');
      expect(result.email).toBe('auth@example.com');
    });
  });

  // ─── findByEmail ───────────────────────────────────────────────────────────
  describe('findByEmail()', () => {
    it('이메일이 일치하는 사용자를 반환한다', async () => {
      const row = makeUserRow({ email: 'find@example.com' });
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.findByEmail('find@example.com');
      expect(result).not.toBeNull();
      expect(result!.email).toBe('find@example.com');
    });

    it('이메일이 없으면 null을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await repo.findByEmail('notfound@example.com');
      expect(result).toBeNull();
    });
  });

  // ─── 에러 전파 ─────────────────────────────────────────────────────────────
  describe('에러 전파', () => {
    it('findById — DB 에러를 그대로 던진다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('DB 연결 실패')),
          }),
        }),
      } as never);

      await expect(repo.findById('user-1')).rejects.toThrow('DB 연결 실패');
    });

    it('update — DB 에러를 그대로 던진다', async () => {
      vi.mocked(mockDb.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error('업데이트 실패')),
          }),
        }),
      } as never);

      await expect(repo.update('user-1', { name: '테스트' })).rejects.toThrow('업데이트 실패');
    });
  });
});
