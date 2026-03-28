import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeRepository } from '@/repositories/codeRepository';

function makeSupabase() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn(),
    delete: vi.fn().mockReturnThis(),
    in: vi.fn(),
  };
  return {
    chain,
    supabase: {
      from: vi.fn().mockReturnValue(chain),
    } as unknown as import('@supabase/supabase-js').SupabaseClient,
  };
}

describe('CodeRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('countByProject', () => {
    it('프로젝트의 코드 버전 수를 반환한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.eq.mockResolvedValueOnce({ count: 5, error: null });
      const repo = new CodeRepository(supabase);
      const count = await repo.countByProject('proj-1');
      expect(count).toBe(5);
    });

    it('count가 null이면 0을 반환한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.eq.mockResolvedValueOnce({ count: null, error: null });
      const repo = new CodeRepository(supabase);
      const count = await repo.countByProject('proj-1');
      expect(count).toBe(0);
    });

    it('DB 오류 시 예외를 던진다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.eq.mockResolvedValueOnce({ count: null, error: { message: 'DB error', code: '500' } });
      const repo = new CodeRepository(supabase);
      await expect(repo.countByProject('proj-1')).rejects.toBeDefined();
    });
  });

  describe('pruneOldVersions', () => {
    it('keepCount를 초과하는 오래된 버전 ID를 삭제한다', async () => {
      const { supabase, chain } = makeSupabase();
      // range()가 삭제 대상 rows를 반환
      chain.range.mockResolvedValueOnce({
        data: [
          { id: 'old-1', version: 1 },
          { id: 'old-2', version: 2 },
        ],
        error: null,
      });
      chain.in.mockResolvedValueOnce({ error: null });

      const repo = new CodeRepository(supabase);
      await repo.pruneOldVersions('proj-1', 5);

      expect(chain.in).toHaveBeenCalledWith('id', ['old-1', 'old-2']);
    });

    it('삭제 대상이 없으면 delete를 호출하지 않는다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.range.mockResolvedValueOnce({ data: [], error: null });

      const repo = new CodeRepository(supabase);
      await repo.pruneOldVersions('proj-1', 10);

      expect(chain.in).not.toHaveBeenCalled();
    });

    it('range 조회 오류 시 예외를 던진다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.range.mockResolvedValueOnce({ data: null, error: { message: 'fail', code: '500' } });

      const repo = new CodeRepository(supabase);
      await expect(repo.pruneOldVersions('proj-1', 5)).rejects.toBeDefined();
    });

    it('delete 오류 시 예외를 던진다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.range.mockResolvedValueOnce({ data: [{ id: 'old-1', version: 1 }], error: null });
      chain.in.mockResolvedValueOnce({ error: { message: 'delete failed', code: '500' } });

      const repo = new CodeRepository(supabase);
      await expect(repo.pruneOldVersions('proj-1', 5)).rejects.toBeDefined();
    });
  });

  describe('getNextVersion', () => {
    it('버전이 없으면 1을 반환한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
      const repo = new CodeRepository(supabase);
      const v = await repo.getNextVersion('proj-1');
      expect(v).toBe(1);
    });

    it('현재 최대 버전 + 1을 반환한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.single.mockResolvedValueOnce({ data: { version: 3 }, error: null });
      const repo = new CodeRepository(supabase);
      const v = await repo.getNextVersion('proj-1');
      expect(v).toBe(4);
    });
  });
});
