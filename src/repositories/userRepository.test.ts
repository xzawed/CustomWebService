import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UserRepository } from './userRepository';
import type { User } from '@/types/user';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeSingleChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

function makeSupabase(chain: ReturnType<typeof makeSingleChain>) {
  return { from: vi.fn().mockReturnValue(chain), rpc: vi.fn() } as unknown as SupabaseClient;
}

// Typical DB row
const dbRow = {
  id: 'user-1',
  email: 'test@test.com',
  name: 'Test',
  avatar_url: null,
  preferences: {},
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

const expectedUser: User = {
  id: 'user-1',
  email: 'test@test.com',
  name: 'Test',
  avatarUrl: null,
  preferences: {},
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserRepository', () => {
  // ---------- createWithAuthId ----------

  describe('createWithAuthId()', () => {
    it('insert({ ...dbData, id: authId }).select().single()을 호출하고 User를 반환한다', async () => {
      const chain = makeSingleChain({ data: dbRow, error: null });
      const supabase = makeSupabase(chain);
      const repo = new UserRepository(supabase);

      const input = {
        email: 'test@test.com',
        name: 'Test',
        avatarUrl: null,
        preferences: {},
      };
      const result = await repo.createWithAuthId('auth-123', input);

      expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('users');
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'auth-123', email: 'test@test.com' }),
      );
      expect(chain.select).toHaveBeenCalled();
      expect(chain.single).toHaveBeenCalled();
      expect(result).toEqual(expectedUser);
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '23505', message: 'duplicate key' };
      const chain = makeSingleChain({ data: null, error: dbError });
      const supabase = makeSupabase(chain);
      const repo = new UserRepository(supabase);

      await expect(
        repo.createWithAuthId('auth-123', {
          email: 'test@test.com',
          name: 'Test',
          avatarUrl: null,
          preferences: {},
        }),
      ).rejects.toEqual(dbError);
    });
  });

  // ---------- findByEmail ----------

  describe('findByEmail()', () => {
    it('select(*).eq(email).single()을 호출하고 User를 반환한다', async () => {
      const chain = makeSingleChain({ data: dbRow, error: null });
      const supabase = makeSupabase(chain);
      const repo = new UserRepository(supabase);

      const result = await repo.findByEmail('test@test.com');

      expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('users');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.eq).toHaveBeenCalledWith('email', 'test@test.com');
      expect(chain.single).toHaveBeenCalled();
      expect(result).toEqual(expectedUser);
      expect(result?.email).toBe('test@test.com');
    });

    it('PGRST116 에러면 null을 반환한다', async () => {
      const chain = makeSingleChain({
        data: null,
        error: { code: 'PGRST116', message: 'Row not found' },
      });
      const supabase = makeSupabase(chain);
      const repo = new UserRepository(supabase);

      const result = await repo.findByEmail('notfound@test.com');
      expect(result).toBeNull();
    });

    it('PGRST116 이외 에러는 throw한다', async () => {
      const dbError = { code: '42P01', message: 'Table does not exist' };
      const chain = makeSingleChain({ data: null, error: dbError });
      const supabase = makeSupabase(chain);
      const repo = new UserRepository(supabase);

      await expect(repo.findByEmail('test@test.com')).rejects.toEqual(dbError);
    });
  });

  // ---------- toDomain mapping ----------

  describe('toDomain() mapping', () => {
    it('null name은 null로 매핑된다', async () => {
      const rowWithNullName = { ...dbRow, name: null };
      const chain = makeSingleChain({ data: rowWithNullName, error: null });
      const supabase = makeSupabase(chain);
      const repo = new UserRepository(supabase);

      const result = await repo.findByEmail('test@test.com');
      expect(result?.name).toBeNull();
    });

    it('null avatar_url은 avatarUrl: null로 매핑된다', async () => {
      const rowWithNullAvatar = { ...dbRow, avatar_url: null };
      const chain = makeSingleChain({ data: rowWithNullAvatar, error: null });
      const supabase = makeSupabase(chain);
      const repo = new UserRepository(supabase);

      const result = await repo.findByEmail('test@test.com');
      expect(result?.avatarUrl).toBeNull();
    });

    it('preferences가 없으면 빈 객체 {}로 기본값이 설정된다', async () => {
      const rowWithNullPrefs = { ...dbRow, preferences: null };
      const chain = makeSingleChain({ data: rowWithNullPrefs, error: null });
      const supabase = makeSupabase(chain);
      const repo = new UserRepository(supabase);

      const result = await repo.findByEmail('test@test.com');
      expect(result?.preferences).toEqual({});
    });

    it('모든 필드가 올바르게 camelCase로 매핑된다', async () => {
      const fullRow = {
        id: 'u-99',
        email: 'full@test.com',
        name: 'Full User',
        avatar_url: 'https://example.com/avatar.png',
        preferences: { language: 'ko', theme: 'dark' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-06-01T00:00:00Z',
      };
      const chain = makeSingleChain({ data: fullRow, error: null });
      const supabase = makeSupabase(chain);
      const repo = new UserRepository(supabase);

      const result = await repo.findByEmail('full@test.com');
      expect(result).toEqual({
        id: 'u-99',
        email: 'full@test.com',
        name: 'Full User',
        avatarUrl: 'https://example.com/avatar.png',
        preferences: { language: 'ko', theme: 'dark' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-06-01T00:00:00Z',
      });
    });
  });
});
