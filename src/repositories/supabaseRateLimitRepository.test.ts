import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseRateLimitRepository } from './supabaseRateLimitRepository';

function makeSupabase() {
  const rpc = vi.fn();
  return { supabase: { rpc } as unknown as SupabaseClient, rpc };
}

describe('SupabaseRateLimitRepository', () => {
  // ---------- checkAndIncrementDailyLimit ----------

  describe('checkAndIncrementDailyLimit()', () => {
    it('try_increment_daily_generation RPC를 호출하고 true를 반환한다', async () => {
      const { supabase, rpc } = makeSupabase();
      rpc.mockResolvedValueOnce({ data: true, error: null });

      const repo = new SupabaseRateLimitRepository(supabase);
      const result = await repo.checkAndIncrementDailyLimit('u1', 10);

      expect(rpc).toHaveBeenCalledWith('try_increment_daily_generation', {
        p_user_id: 'u1',
        p_limit: 10,
      });
      expect(result).toBe(true);
    });

    it('한도 초과 시 false를 반환한다', async () => {
      const { supabase, rpc } = makeSupabase();
      rpc.mockResolvedValueOnce({ data: false, error: null });

      const repo = new SupabaseRateLimitRepository(supabase);
      const result = await repo.checkAndIncrementDailyLimit('u1', 10);

      expect(result).toBe(false);
    });

    it('에러 발생 시 throw한다', async () => {
      const { supabase, rpc } = makeSupabase();
      const dbError = { code: 'P0001', message: 'DB error' };
      rpc.mockResolvedValueOnce({ data: null, error: dbError });

      const repo = new SupabaseRateLimitRepository(supabase);
      await expect(repo.checkAndIncrementDailyLimit('u1', 10)).rejects.toEqual(dbError);
    });
  });

  // ---------- decrementDailyLimit ----------

  describe('decrementDailyLimit()', () => {
    it('decrement_daily_generation RPC를 호출하고 void를 반환한다', async () => {
      const { supabase, rpc } = makeSupabase();
      rpc.mockResolvedValueOnce({ error: null });

      const repo = new SupabaseRateLimitRepository(supabase);
      await repo.decrementDailyLimit('u1');

      expect(rpc).toHaveBeenCalledWith('decrement_daily_generation', { p_user_id: 'u1' });
    });

    it('에러 발생 시 throw한다', async () => {
      const { supabase, rpc } = makeSupabase();
      const dbError = { code: 'P0001', message: 'DB error' };
      rpc.mockResolvedValueOnce({ error: dbError });

      const repo = new SupabaseRateLimitRepository(supabase);
      await expect(repo.decrementDailyLimit('u1')).rejects.toEqual(dbError);
    });
  });

  // ---------- getCurrentUsage ----------

  describe('getCurrentUsage()', () => {
    it('get_daily_generation_count RPC를 호출하고 숫자를 반환한다', async () => {
      const { supabase, rpc } = makeSupabase();
      rpc.mockResolvedValueOnce({ data: 5, error: null });

      const repo = new SupabaseRateLimitRepository(supabase);
      const result = await repo.getCurrentUsage('u1');

      expect(rpc).toHaveBeenCalledWith('get_daily_generation_count', { p_user_id: 'u1' });
      expect(result).toBe(5);
    });

    it('data가 null이면 0을 반환한다', async () => {
      const { supabase, rpc } = makeSupabase();
      rpc.mockResolvedValueOnce({ data: null, error: null });

      const repo = new SupabaseRateLimitRepository(supabase);
      const result = await repo.getCurrentUsage('u1');

      expect(result).toBe(0);
    });

    it('에러 발생 시 throw한다', async () => {
      const { supabase, rpc } = makeSupabase();
      const dbError = { code: 'P0001', message: 'DB error' };
      rpc.mockResolvedValueOnce({ data: null, error: dbError });

      const repo = new SupabaseRateLimitRepository(supabase);
      await expect(repo.getCurrentUsage('u1')).rejects.toEqual(dbError);
    });
  });

  // ---------- checkAndIncrementDailyDeployLimit ----------

  describe('checkAndIncrementDailyDeployLimit()', () => {
    it('try_increment_daily_deploy RPC를 호출하고 true를 반환한다', async () => {
      const { supabase, rpc } = makeSupabase();
      rpc.mockResolvedValueOnce({ data: true, error: null });

      const repo = new SupabaseRateLimitRepository(supabase);
      const result = await repo.checkAndIncrementDailyDeployLimit('u1', 5);

      expect(rpc).toHaveBeenCalledWith('try_increment_daily_deploy', {
        p_user_id: 'u1',
        p_limit: 5,
      });
      expect(result).toBe(true);
    });

    it('한도 초과 시 false를 반환한다', async () => {
      const { supabase, rpc } = makeSupabase();
      rpc.mockResolvedValueOnce({ data: false, error: null });

      const repo = new SupabaseRateLimitRepository(supabase);
      const result = await repo.checkAndIncrementDailyDeployLimit('u1', 5);

      expect(result).toBe(false);
    });

    it('에러 발생 시 throw한다', async () => {
      const { supabase, rpc } = makeSupabase();
      const dbError = { code: 'P0001', message: 'deploy limit error' };
      rpc.mockResolvedValueOnce({ data: null, error: dbError });

      const repo = new SupabaseRateLimitRepository(supabase);
      await expect(repo.checkAndIncrementDailyDeployLimit('u1', 5)).rejects.toEqual(dbError);
    });
  });
});
