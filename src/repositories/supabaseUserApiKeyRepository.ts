import type { SupabaseClient } from '@supabase/supabase-js';
import type { IUserApiKeyRepository, UserApiKey } from '@/repositories/interfaces';

function toDomainUserApiKey(row: Record<string, unknown>): UserApiKey {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    apiId: row.api_id as string,
    encryptedKey: row.encrypted_key as string,
    isVerified: (row.is_verified as boolean) ?? false,
    verifiedAt: (row.verified_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class SupabaseUserApiKeyRepository implements IUserApiKeyRepository {
  constructor(private supabase: SupabaseClient) {}

  async upsert(userId: string, apiId: string, encryptedKey: string): Promise<UserApiKey> {
    const { data, error } = await this.supabase
      .from('user_api_keys')
      .upsert(
        { user_id: userId, api_id: apiId, encrypted_key: encryptedKey },
        { onConflict: 'user_id,api_id' },
      )
      .select()
      .single();
    if (error) throw error;
    return toDomainUserApiKey(data as Record<string, unknown>);
  }

  async delete(userId: string, apiId: string): Promise<void> {
    const { error } = await this.supabase
      .from('user_api_keys')
      .delete()
      .eq('user_id', userId)
      .eq('api_id', apiId);
    if (error) throw error;
  }

  async findByUserAndApi(userId: string, apiId: string): Promise<UserApiKey | null> {
    const { data, error } = await this.supabase
      .from('user_api_keys')
      .select('*')
      .eq('user_id', userId)
      .eq('api_id', apiId)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return toDomainUserApiKey(data as Record<string, unknown>);
  }

  async findAllByUser(userId: string): Promise<UserApiKey[]> {
    const { data, error } = await this.supabase
      .from('user_api_keys')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return (data ?? []).map((row) => toDomainUserApiKey(row as Record<string, unknown>));
  }

  async updateVerificationStatus(
    userId: string,
    apiId: string,
    isVerified: boolean,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('user_api_keys')
      .update({
        is_verified: isVerified,
        verified_at: isVerified ? new Date().toISOString() : null,
      })
      .eq('user_id', userId)
      .eq('api_id', apiId);
    if (error) throw error;
  }
}
