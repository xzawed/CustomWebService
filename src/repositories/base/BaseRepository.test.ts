import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from './BaseRepository';

// --- Concrete test subclass ---

interface TestItem {
  id: string;
  name: string;
  createdAt: string;
}

class TestRepo extends BaseRepository<TestItem> {
  protected toDomain(row: Record<string, unknown>): TestItem {
    return {
      id: row.id as string,
      name: row.name as string,
      createdAt: row.created_at as string,
    };
  }
}

// --- Mock helpers ---

/**
 * Builds a chainable mock that returns `this` for every listed method,
 * and resolves a given result when the chain is awaited.
 * The result is exposed on the chain object itself so that
 * `await chain` (via `.then`) resolves to it.
 */
function makeChain(result: Record<string, unknown>) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    // Make the chain itself awaitable by providing a `.then` method
    then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

function makeRepoWithChain(result: Record<string, unknown>): {
  repo: TestRepo;
  chain: ReturnType<typeof makeChain>;
  fromMock: ReturnType<typeof vi.fn>;
} {
  const chain = makeChain(result);
  const fromMock = vi.fn().mockReturnValue(chain);
  const supabase = { from: fromMock } as unknown as SupabaseClient;
  const repo = new TestRepo(supabase, 'test_table');
  return { repo, chain, fromMock };
}

// For single() – needs a separate resolution via single()
function makeSingleChain(result: Record<string, unknown>) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
  // Also make the chain itself awaitable (for delete / count)
  Object.assign(chain, {
    then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
  });
  return chain;
}

function makeRepoWithSingleChain(result: Record<string, unknown>): {
  repo: TestRepo;
  chain: ReturnType<typeof makeSingleChain>;
  fromMock: ReturnType<typeof vi.fn>;
} {
  const chain = makeSingleChain(result);
  const fromMock = vi.fn().mockReturnValue(chain);
  const supabase = { from: fromMock } as unknown as SupabaseClient;
  const repo = new TestRepo(supabase, 'test_table');
  return { repo, chain, fromMock };
}

// ---------------------------------------------------------------------------

describe('BaseRepository', () => {
  // ---------- findById ----------

  describe('findById()', () => {
    it('행을 찾으면 도메인 객체를 반환한다', async () => {
      const dbRow = { id: '1', name: 'Alice', created_at: '2024-01-01' };
      const { repo, chain, fromMock } = makeRepoWithSingleChain({ data: dbRow, error: null });

      const result = await repo.findById('1');

      expect(fromMock).toHaveBeenCalledWith('test_table');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.eq).toHaveBeenCalledWith('id', '1');
      expect(chain.single).toHaveBeenCalled();
      expect(result).toEqual({ id: '1', name: 'Alice', createdAt: '2024-01-01' });
    });

    it('PGRST116 에러면 null을 반환한다', async () => {
      const { repo } = makeRepoWithSingleChain({
        data: null,
        error: { code: 'PGRST116', message: 'Row not found' },
      });

      const result = await repo.findById('missing');
      expect(result).toBeNull();
    });

    it('PGRST116 이외 에러는 throw한다', async () => {
      const dbError = { code: '42P01', message: 'Table does not exist' };
      const { repo } = makeRepoWithSingleChain({ data: null, error: dbError });

      await expect(repo.findById('1')).rejects.toEqual(dbError);
    });
  });

  // ---------- findMany ----------

  describe('findMany()', () => {
    it('필터 없이 호출하면 올바른 체인을 거쳐 items와 total을 반환한다', async () => {
      const dbRow = { id: '1', name: 'Alice', created_at: '2024-01-01' };
      const { repo, chain, fromMock } = makeRepoWithChain({
        data: [dbRow],
        error: null,
        count: 1,
      });

      const result = await repo.findMany();

      expect(fromMock).toHaveBeenCalledWith('test_table');
      expect(chain.select).toHaveBeenCalledWith('*', { count: 'exact' });
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(chain.range).toHaveBeenCalledWith(0, 19); // page=1, limit=20
      expect(result).toEqual({
        items: [{ id: '1', name: 'Alice', createdAt: '2024-01-01' }],
        total: 1,
      });
    });

    it('camelCase 필터 키를 snake_case로 변환해서 .eq()를 호출한다', async () => {
      const dbRow = { id: '2', name: 'Bob', created_at: '2024-02-01' };
      const { repo, chain } = makeRepoWithChain({ data: [dbRow], error: null, count: 1 });

      await repo.findMany({ userId: 'u1' });

      expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1');
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '42P01', message: 'Table not found' };
      const { repo } = makeRepoWithChain({ data: null, error: dbError, count: null });

      await expect(repo.findMany()).rejects.toEqual(dbError);
    });

    it('count가 null이면 total: 0을 반환한다', async () => {
      const { repo } = makeRepoWithChain({ data: [], error: null, count: null });
      const result = await repo.findMany();
      expect(result.total).toBe(0);
    });

    it('undefined/null 필터 값은 .eq() 호출을 건너뛴다', async () => {
      const { repo, chain } = makeRepoWithChain({ data: [], error: null, count: 0 });

      await repo.findMany({ userId: undefined, name: null });

      // eq should only have been called as part of order/range setup, not with user filters
      const eqCalls = (chain.eq as ReturnType<typeof vi.fn>).mock.calls;
      const filterEqCalls = eqCalls.filter(
        (call) => call[0] === 'user_id' || call[0] === 'name',
      );
      expect(filterEqCalls).toHaveLength(0);
    });
  });

  // ---------- create ----------

  describe('create()', () => {
    it('insert().select().single()을 호출하고 도메인 객체를 반환한다', async () => {
      const dbRow = { id: 'new-id', name: 'Charlie', created_at: '2024-03-01' };
      const { repo, chain, fromMock } = makeRepoWithSingleChain({ data: dbRow, error: null });

      const result = await repo.create({ name: 'Charlie' } as Omit<
        TestItem,
        'id' | 'createdAt' | 'updatedAt'
      >);

      expect(fromMock).toHaveBeenCalledWith('test_table');
      expect(chain.insert).toHaveBeenCalled();
      expect(chain.select).toHaveBeenCalled();
      expect(chain.single).toHaveBeenCalled();
      expect(result).toEqual({ id: 'new-id', name: 'Charlie', createdAt: '2024-03-01' });
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '23505', message: 'duplicate key' };
      const { repo } = makeRepoWithSingleChain({ data: null, error: dbError });

      await expect(
        repo.create({ name: 'Alice' } as Omit<TestItem, 'id' | 'createdAt' | 'updatedAt'>),
      ).rejects.toEqual(dbError);
    });
  });

  // ---------- update ----------

  describe('update()', () => {
    it('update({...patch, updated_at}).eq(id).select().single()을 호출하고 도메인 객체를 반환한다', async () => {
      const dbRow = { id: '1', name: 'Updated', created_at: '2024-01-01' };
      const { repo, chain, fromMock } = makeRepoWithSingleChain({ data: dbRow, error: null });

      const result = await repo.update('1', { name: 'Updated' });

      expect(fromMock).toHaveBeenCalledWith('test_table');
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated', updated_at: expect.any(String) }),
      );
      expect(chain.eq).toHaveBeenCalledWith('id', '1');
      expect(chain.select).toHaveBeenCalled();
      expect(chain.single).toHaveBeenCalled();
      expect(result).toEqual({ id: '1', name: 'Updated', createdAt: '2024-01-01' });
    });

    it('updated_at에 ISO 형식 날짜를 설정한다', async () => {
      const dbRow = { id: '1', name: 'Updated', created_at: '2024-01-01' };
      const { repo, chain } = makeRepoWithSingleChain({ data: dbRow, error: null });

      await repo.update('1', { name: 'Updated' });

      const updateArg = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateArg.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '42P01', message: 'table not found' };
      const { repo } = makeRepoWithSingleChain({ data: null, error: dbError });

      await expect(repo.update('1', { name: 'X' })).rejects.toEqual(dbError);
    });
  });

  // ---------- delete ----------

  describe('delete()', () => {
    it('delete().eq(id)를 호출하고 void를 반환한다', async () => {
      const { repo, chain, fromMock } = makeRepoWithChain({ error: null });

      await repo.delete('1');

      expect(fromMock).toHaveBeenCalledWith('test_table');
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('id', '1');
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '42P01', message: 'table not found' };
      const { repo } = makeRepoWithChain({ error: dbError });

      await expect(repo.delete('1')).rejects.toEqual(dbError);
    });
  });

  // ---------- count ----------

  describe('count()', () => {
    it('select(*,{count:exact,head:true})를 호출하고 count를 반환한다', async () => {
      const { repo, chain, fromMock } = makeRepoWithChain({ count: 42, error: null });

      const result = await repo.count();

      expect(fromMock).toHaveBeenCalledWith('test_table');
      expect(chain.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
      expect(result).toBe(42);
    });

    it('count가 null이면 0을 반환한다', async () => {
      const { repo } = makeRepoWithChain({ count: null, error: null });
      const result = await repo.count();
      expect(result).toBe(0);
    });

    it('필터가 있으면 snake_case로 변환해서 .eq()를 호출한다', async () => {
      const { repo, chain } = makeRepoWithChain({ count: 3, error: null });

      await repo.count({ userId: 'u1' });

      expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1');
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '42P01', message: 'table not found' };
      const { repo } = makeRepoWithChain({ count: null, error: dbError });

      await expect(repo.count()).rejects.toEqual(dbError);
    });
  });
});
