import type { SupabaseClient } from '@supabase/supabase-js';
import { getDbProvider } from '@/lib/config/providers';
import { getDb } from '@/lib/db/connection';
import type {
  IProjectRepository,
  IUserRepository,
  ICodeRepository,
  ICatalogRepository,
  IOrganizationRepository,
  IEventRepository,
  IRateLimitRepository,
  IUserApiKeyRepository,
  IGalleryRepository,
  UserApiKey,
} from '@/repositories/interfaces';

// Supabase implementations
import { ProjectRepository } from '@/repositories/projectRepository';
import { UserRepository } from '@/repositories/userRepository';
import { CodeRepository } from '@/repositories/codeRepository';
import { CatalogRepository } from '@/repositories/catalogRepository';
import { OrganizationRepository } from '@/repositories/organizationRepository';
import { EventRepository } from '@/repositories/eventRepository';
import { GalleryRepository } from '@/repositories/galleryRepository';

// Drizzle implementations
import {
  DrizzleProjectRepository,
  DrizzleUserRepository,
  DrizzleCodeRepository,
  DrizzleCatalogRepository,
  DrizzleOrganizationRepository,
  DrizzleEventRepository,
  DrizzleRateLimitRepository,
  DrizzleUserApiKeyRepository,
} from '@/repositories/drizzle';

// ---------------------------------------------------------------------------
// Supabase adapter: IRateLimitRepository
// Wraps the Supabase RPC calls that currently live in RateLimitService
// ---------------------------------------------------------------------------
class SupabaseRateLimitRepository implements IRateLimitRepository {
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

// ---------------------------------------------------------------------------
// Supabase adapter: IUserApiKeyRepository
// Wraps the direct Supabase calls currently in src/app/api/v1/user-api-keys/route.ts
// ---------------------------------------------------------------------------
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

class SupabaseUserApiKeyRepository implements IUserApiKeyRepository {
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

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createProjectRepository(supabase?: SupabaseClient): IProjectRepository {
  if (getDbProvider() === 'postgres') {
    return new DrizzleProjectRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new ProjectRepository(supabase);
}

export function createUserRepository(supabase?: SupabaseClient): IUserRepository {
  if (getDbProvider() === 'postgres') {
    return new DrizzleUserRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new UserRepository(supabase);
}

export function createCodeRepository(supabase?: SupabaseClient): ICodeRepository {
  if (getDbProvider() === 'postgres') {
    return new DrizzleCodeRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new CodeRepository(supabase);
}

export function createCatalogRepository(supabase?: SupabaseClient): ICatalogRepository {
  if (getDbProvider() === 'postgres') {
    return new DrizzleCatalogRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new CatalogRepository(supabase);
}

export function createOrganizationRepository(supabase?: SupabaseClient): IOrganizationRepository {
  if (getDbProvider() === 'postgres') {
    return new DrizzleOrganizationRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new OrganizationRepository(supabase);
}

export function createEventRepository(supabase?: SupabaseClient): IEventRepository {
  if (getDbProvider() === 'postgres') {
    return new DrizzleEventRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new EventRepository(supabase);
}

export function createRateLimitRepository(supabase?: SupabaseClient): IRateLimitRepository {
  if (getDbProvider() === 'postgres') {
    return new DrizzleRateLimitRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new SupabaseRateLimitRepository(supabase);
}

export function createUserApiKeyRepository(supabase?: SupabaseClient): IUserApiKeyRepository {
  if (getDbProvider() === 'postgres') {
    return new DrizzleUserApiKeyRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new SupabaseUserApiKeyRepository(supabase);
}

export function createGalleryRepository(supabase?: SupabaseClient): IGalleryRepository {
  // Gallery uses Supabase-specific features (RPC for likes, joins) — Drizzle not yet implemented
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new GalleryRepository(supabase);
}
