import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventRepository } from '@/repositories/eventRepository';
import type { DomainEvent } from '@/types/events';

type MockResult = { error: unknown; [key: string]: unknown };
type MockSelectResult = { data: unknown; error: unknown };

function makeSupabase(
  insertResult: MockResult = { error: null },
  selectResult: MockSelectResult = { data: [], error: null }
) {
  const insertChain = {
    insert: vi.fn().mockResolvedValue(insertResult),
  };
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(selectResult),
  };
  return {
    from: vi.fn((table: string) => (table === 'platform_events' ? { ...insertChain, ...selectChain } : {})),
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

const mockEvent: DomainEvent = {
  type: 'CODE_GENERATED',
  payload: { projectId: 'proj-1', version: 1, provider: 'xai', durationMs: 1200 },
};

describe('EventRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('persist', () => {
    it('이벤트를 platform_events 테이블에 삽입한다', async () => {
      const supabase = makeSupabase();
      const repo = new EventRepository(supabase);
      await repo.persist(mockEvent, { userId: 'user-1', projectId: 'proj-1' });
      expect(supabase.from).toHaveBeenCalledWith('platform_events');
    });

    it('삽입 오류 시 예외를 던지지 않는다 (best-effort)', async () => {
      const supabase = makeSupabase({ error: { message: 'insert failed', code: '500' } });
      const repo = new EventRepository(supabase);
      await expect(
        repo.persist(mockEvent, { userId: 'user-1' })
      ).resolves.toBeUndefined();
    });

    it('context 없이 호출해도 동작한다', async () => {
      const supabase = makeSupabase();
      const repo = new EventRepository(supabase);
      await expect(repo.persist(mockEvent)).resolves.toBeUndefined();
    });

    it('payload에서 projectId를 자동으로 추출한다', async () => {
      const supabase = makeSupabase();
      const repo = new EventRepository(supabase);
      // context에 projectId를 주지 않아도 payload.projectId를 사용해야 함
      await repo.persist(mockEvent, { userId: 'user-1' });
      const fromReturn = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(fromReturn.insert).toHaveBeenCalledWith(
        expect.objectContaining({ project_id: 'proj-1' })
      );
    });
  });

  describe('persistAsync', () => {
    it('fire-and-forget — 예외를 던지지 않는다', () => {
      const supabase = makeSupabase({ error: { message: 'fail', code: '500' } });
      const repo = new EventRepository(supabase);
      // Should not throw synchronously
      expect(() => repo.persistAsync(mockEvent, { userId: 'user-1' })).not.toThrow();
    });
  });

  describe('findByUser', () => {
    it('사용자 이벤트 목록을 반환한다', async () => {
      const mockData = [
        { id: 'ev-1', type: 'CODE_GENERATED', payload: {}, created_at: '2026-01-01T00:00:00Z' },
      ];
      const supabase = makeSupabase(
        { error: null },
        { data: mockData, error: null }
      );
      const repo = new EventRepository(supabase);
      const events = await repo.findByUser('user-1');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('CODE_GENERATED');
      expect(events[0].createdAt).toBe('2026-01-01T00:00:00Z');
    });

    it('오류 시 빈 배열을 반환한다', async () => {
      const supabase = makeSupabase(
        { error: null },
        { data: null, error: { message: 'fail' } }
      );
      const repo = new EventRepository(supabase);
      const events = await repo.findByUser('user-1');
      expect(events).toEqual([]);
    });

    it('limit 최대값 100을 초과하지 않는다', async () => {
      const supabase = makeSupabase({ error: null }, { data: [], error: null });
      const repo = new EventRepository(supabase);
      await repo.findByUser('user-1', 200);
      const fromReturn = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value;
      // limit()이 100 이하로 호출됐는지 확인
      expect(fromReturn.limit).toHaveBeenCalledWith(100);
    });
  });
});
