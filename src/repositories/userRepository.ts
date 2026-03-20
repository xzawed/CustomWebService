import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from './base/BaseRepository';
import type { User, UserPreferences } from '@/types/organization';

export class UserRepository extends BaseRepository<User> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'users');
  }

  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this.toDomain(data);
  }

  protected toDomain(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      email: row.email as string,
      name: (row.name as string) ?? null,
      avatarUrl: (row.avatar_url as string) ?? null,
      preferences: (row.preferences as UserPreferences) ?? {},
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
