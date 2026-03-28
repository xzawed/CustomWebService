import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitService } from '@/services/rateLimitService';
import { RateLimitError } from '@/lib/utils/errors';

function makeSupabase(rpcResult: { data: unknown; error: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('RateLimitService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAndIncrementDailyLimit', () => {
    it('data=true이면 정상 통과한다', async () => {
      const supabase = makeSupabase({ data: true, error: null });
      const service = new RateLimitService(supabase);
      await expect(service.checkAndIncrementDailyLimit('user-1')).resolves.toBeUndefined();
    });

    it('data=false이면 RateLimitError를 던진다', async () => {
      const supabase = makeSupabase({ data: false, error: null });
      const service = new RateLimitService(supabase);
      await expect(service.checkAndIncrementDailyLimit('user-1')).rejects.toBeInstanceOf(
        RateLimitError
      );
    });

    it('DB 오류 발생 시 fail-open — 예외 없이 통과한다', async () => {
      const supabase = makeSupabase({ data: null, error: { message: 'DB down', code: '500' } });
      const service = new RateLimitService(supabase);
      // Should NOT throw — fail open
      await expect(service.checkAndIncrementDailyLimit('user-1')).resolves.toBeUndefined();
    });

    it('올바른 RPC 파라미터로 호출한다', async () => {
      const supabase = makeSupabase({ data: true, error: null });
      const service = new RateLimitService(supabase);
      await service.checkAndIncrementDailyLimit('user-abc');
      expect(supabase.rpc).toHaveBeenCalledWith('try_increment_daily_generation', {
        p_user_id: 'user-abc',
        p_limit: expect.any(Number),
      });
    });
  });

  describe('decrementDailyLimit', () => {
    it('정상적으로 decrement RPC를 호출한다', async () => {
      const supabase = makeSupabase({ data: null, error: null });
      const service = new RateLimitService(supabase);
      await expect(service.decrementDailyLimit('user-1')).resolves.toBeUndefined();
      expect(supabase.rpc).toHaveBeenCalledWith('decrement_daily_generation', {
        p_user_id: 'user-1',
      });
    });

    it('RPC 오류가 발생해도 예외를 던지지 않는다 (best-effort)', async () => {
      const supabase = makeSupabase({ data: null, error: { message: 'fail', code: '500' } });
      const service = new RateLimitService(supabase);
      await expect(service.decrementDailyLimit('user-1')).resolves.toBeUndefined();
    });
  });

  describe('getCurrentUsage', () => {
    it('현재 사용량을 반환한다', async () => {
      const supabase = makeSupabase({ data: 3, error: null });
      const service = new RateLimitService(supabase);
      const usage = await service.getCurrentUsage('user-1');
      expect(usage).toBe(3);
    });

    it('data가 null이면 0을 반환한다', async () => {
      const supabase = makeSupabase({ data: null, error: null });
      const service = new RateLimitService(supabase);
      const usage = await service.getCurrentUsage('user-1');
      expect(usage).toBe(0);
    });

    it('DB 오류 시 0을 반환한다', async () => {
      const supabase = makeSupabase({ data: null, error: { message: 'error', code: '500' } });
      const service = new RateLimitService(supabase);
      const usage = await service.getCurrentUsage('user-1');
      expect(usage).toBe(0);
    });
  });
});
