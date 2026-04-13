import type { SupabaseClient } from '@supabase/supabase-js';
import type { IRateLimitRepository } from '@/repositories/interfaces';

export class SupabaseRateLimitRepository implements IRateLimitRepository {
  constructor(private supabase: SupabaseClient) {}

  async checkAndIncrementDailyLimit(userId: string, limit: number): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('try_increment_daily_generation', {
      p_user_id: userId,
      p_limit: limit,
    });
    if (error) throw error;
    return data as boolean;
  }

  async decrementDailyLimit(userId: string): Promise<void> {
    const { error } = await this.supabase.rpc('decrement_daily_generation', {
      p_user_id: userId,
    });
    if (error) throw error;
  }

  async getCurrentUsage(userId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('get_daily_generation_count', {
      p_user_id: userId,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }
}
