import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseUserApiKeyRepository } from './supabaseUserApiKeyRepository';
import type { UserApiKey } from './interfaces';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Builds a fully chainable mock for the normal case where the chain ends with .single().
 * The chain itself is also awaitable (for delete / updateVerificationStatus).
 */
function makeChain(result: Record<string, unknown>) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    // Make chain itself awaitable so delete/update chains resolve too
    then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

function makeSupabase(chain: ReturnType<typeof makeChain>) {
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
}

/** Convenience: create repo + supabase around a single chain */
function makeRepo(result: Record<string, unknown>): {
  repo: SupabaseUserApiKeyRepository;
  chain: ReturnType<typeof makeChain>;
  from: ReturnType<typeof vi.fn>;
} {
  const chain = makeChain(result);
  const supabase = makeSupabase(chain);
  const repo = new SupabaseUserApiKeyRepository(supabase);
  return { repo, chain, from: (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from };
}

// Typical DB row that maps to a UserApiKey
const dbRow = {
  id: 'key-1',
  user_id: 'u1',
  api_id: 'api1',
  encrypted_key: 'enc-abc',
  is_verified: true,
  verified_at: '2024-06-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
};

const expectedDomain: UserApiKey = {
  id: 'key-1',
  userId: 'u1',
  apiId: 'api1',
  encryptedKey: 'enc-abc',
  isVerified: true,
  verifiedAt: '2024-06-01T00:00:00Z',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SupabaseUserApiKeyRepository', () => {
  // ---------- upsert ----------

  describe('upsert()', () => {
    it('upsert().select().single()을 호출하고 UserApiKey를 반환한다', async () => {
      const { repo, chain, from } = makeRepo({ data: dbRow, error: null });

      const result = await repo.upsert('u1', 'api1', 'enc-abc');

      expect(from).toHaveBeenCalledWith('user_api_keys');
      expect(chain.upsert).toHaveBeenCalledWith(
        { user_id: 'u1', api_id: 'api1', encrypted_key: 'enc-abc' },
        { onConflict: 'user_id,api_id' },
      );
      expect(chain.select).toHaveBeenCalled();
      expect(chain.single).toHaveBeenCalled();
      expect(result).toEqual(expectedDomain);
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '23505', message: 'duplicate key' };
      const { repo } = makeRepo({ data: null, error: dbError });

      await expect(repo.upsert('u1', 'api1', 'enc-abc')).rejects.toEqual(dbError);
    });
  });

  // ---------- delete ----------

  describe('delete()', () => {
    it('delete().eq(user_id).eq(api_id)를 호출한다', async () => {
      const { repo, chain, from } = makeRepo({ error: null });

      await repo.delete('u1', 'api1');

      expect(from).toHaveBeenCalledWith('user_api_keys');
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1');
      expect(chain.eq).toHaveBeenCalledWith('api_id', 'api1');
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '42P01', message: 'table not found' };
      const { repo } = makeRepo({ error: dbError });

      await expect(repo.delete('u1', 'api1')).rejects.toEqual(dbError);
    });
  });

  // ---------- findByUserAndApi ----------

  describe('findByUserAndApi()', () => {
    it('select().eq().eq().single()을 호출하고 UserApiKey를 반환한다', async () => {
      const { repo, chain, from } = makeRepo({ data: dbRow, error: null });

      const result = await repo.findByUserAndApi('u1', 'api1');

      expect(from).toHaveBeenCalledWith('user_api_keys');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1');
      expect(chain.eq).toHaveBeenCalledWith('api_id', 'api1');
      expect(chain.single).toHaveBeenCalled();
      expect(result).toEqual(expectedDomain);
    });

    it('PGRST116 에러면 null을 반환한다', async () => {
      const { repo } = makeRepo({
        data: null,
        error: { code: 'PGRST116', message: 'Row not found' },
      });

      const result = await repo.findByUserAndApi('u1', 'api1');
      expect(result).toBeNull();
    });

    it('PGRST116 이외 에러는 throw한다', async () => {
      const dbError = { code: '42P01', message: 'table error' };
      const { repo } = makeRepo({ data: null, error: dbError });

      await expect(repo.findByUserAndApi('u1', 'api1')).rejects.toEqual(dbError);
    });
  });

  // ---------- findAllByUser ----------

  describe('findAllByUser()', () => {
    it('select().eq()를 호출하고 UserApiKey 배열을 반환한다', async () => {
      const row2 = {
        ...dbRow,
        id: 'key-2',
        api_id: 'api2',
        is_verified: false,
        verified_at: null,
      };
      // For findAllByUser the last call is .eq() which resolves directly (no .single())
      const arrayChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [dbRow, row2], error: null }),
      };
      const supabase = {
        from: vi.fn().mockReturnValue(arrayChain),
      } as unknown as SupabaseClient;
      const repo = new SupabaseUserApiKeyRepository(supabase);

      const result = await repo.findAllByUser('u1');

      expect(arrayChain.select).toHaveBeenCalledWith('*');
      expect(arrayChain.eq).toHaveBeenCalledWith('user_id', 'u1');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expectedDomain);
      expect(result[1].id).toBe('key-2');
      expect(result[1].isVerified).toBe(false);
      expect(result[1].verifiedAt).toBeNull();
    });

    it('결과가 없으면 빈 배열을 반환한다', async () => {
      const arrayChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      const supabase = { from: vi.fn().mockReturnValue(arrayChain) } as unknown as SupabaseClient;
      const repo = new SupabaseUserApiKeyRepository(supabase);

      const result = await repo.findAllByUser('u1');
      expect(result).toEqual([]);
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '42P01', message: 'table not found' };
      const arrayChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      };
      const supabase = { from: vi.fn().mockReturnValue(arrayChain) } as unknown as SupabaseClient;
      const repo = new SupabaseUserApiKeyRepository(supabase);

      await expect(repo.findAllByUser('u1')).rejects.toEqual(dbError);
    });
  });

  // ---------- updateVerificationStatus ----------

  describe('updateVerificationStatus()', () => {
    it('isVerified=true → is_verified:true, verified_at: non-null ISO string', async () => {
      const { repo, chain, from } = makeRepo({ error: null });

      await repo.updateVerificationStatus('u1', 'api1', true);

      expect(from).toHaveBeenCalledWith('user_api_keys');
      const updateArg = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateArg.is_verified).toBe(true);
      expect(updateArg.verified_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1');
      expect(chain.eq).toHaveBeenCalledWith('api_id', 'api1');
    });

    it('isVerified=false → is_verified:false, verified_at: null', async () => {
      const { repo, chain } = makeRepo({ error: null });

      await repo.updateVerificationStatus('u1', 'api1', false);

      const updateArg = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateArg.is_verified).toBe(false);
      expect(updateArg.verified_at).toBeNull();
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '42P01', message: 'table not found' };
      const { repo } = makeRepo({ error: dbError });

      await expect(repo.updateVerificationStatus('u1', 'api1', true)).rejects.toEqual(dbError);
    });
  });
});
