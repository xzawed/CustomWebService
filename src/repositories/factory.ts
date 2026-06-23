import type { SupabaseClient } from '@supabase/supabase-js';
import { getDbProvider } from '@/lib/config/providers';
import { getDb } from '@/lib/db/connection';
import { getSqliteDb } from '@/lib/db/sqlite/connection';
import type {
  IProjectRepository,
  IUserRepository,
  ICodeRepository,
  ICatalogRepository,
  IEventRepository,
  IRateLimitRepository,
  IUserApiKeyRepository,
} from '@/repositories/interfaces';

// Supabase implementations
import { ProjectRepository } from '@/repositories/projectRepository';
import { UserRepository } from '@/repositories/userRepository';
import { CodeRepository } from '@/repositories/codeRepository';
import { CatalogRepository } from '@/repositories/catalogRepository';
import { EventRepository } from '@/repositories/eventRepository';
import { SupabaseRateLimitRepository } from '@/repositories/supabaseRateLimitRepository';
import { SupabaseUserApiKeyRepository } from '@/repositories/supabaseUserApiKeyRepository';

// Drizzle implementations
import {
  DrizzleProjectRepository,
  DrizzleUserRepository,
  DrizzleCodeRepository,
  DrizzleCatalogRepository,
  DrizzleEventRepository,
  DrizzleRateLimitRepository,
  DrizzleUserApiKeyRepository,
} from '@/repositories/drizzle';

// SQLite implementations (DB_PROVIDER=sqlite — 임베디드 단일 인스턴스)
import {
  SqliteProjectRepository,
  SqliteUserRepository,
  SqliteCodeRepository,
  SqliteCatalogRepository,
  SqliteEventRepository,
  SqliteRateLimitRepository,
  SqliteUserApiKeyRepository,
} from '@/repositories/sqlite';

export function createProjectRepository(supabase?: SupabaseClient): IProjectRepository {
  if (getDbProvider() === 'sqlite') {
    return new SqliteProjectRepository(getSqliteDb());
  }
  if (getDbProvider() === 'postgres') {
    return new DrizzleProjectRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new ProjectRepository(supabase);
}

export function createUserRepository(supabase?: SupabaseClient): IUserRepository {
  if (getDbProvider() === 'sqlite') {
    return new SqliteUserRepository(getSqliteDb());
  }
  if (getDbProvider() === 'postgres') {
    return new DrizzleUserRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new UserRepository(supabase);
}

export function createCodeRepository(supabase?: SupabaseClient): ICodeRepository {
  if (getDbProvider() === 'sqlite') {
    return new SqliteCodeRepository(getSqliteDb());
  }
  if (getDbProvider() === 'postgres') {
    return new DrizzleCodeRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new CodeRepository(supabase);
}

export function createCatalogRepository(supabase?: SupabaseClient): ICatalogRepository {
  if (getDbProvider() === 'sqlite') {
    return new SqliteCatalogRepository(getSqliteDb());
  }
  if (getDbProvider() === 'postgres') {
    return new DrizzleCatalogRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new CatalogRepository(supabase);
}

export function createEventRepository(supabase?: SupabaseClient): IEventRepository {
  if (getDbProvider() === 'sqlite') {
    return new SqliteEventRepository(getSqliteDb());
  }
  if (getDbProvider() === 'postgres') {
    return new DrizzleEventRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new EventRepository(supabase);
}

export function createRateLimitRepository(supabase?: SupabaseClient): IRateLimitRepository {
  if (getDbProvider() === 'sqlite') {
    return new SqliteRateLimitRepository(getSqliteDb());
  }
  if (getDbProvider() === 'postgres') {
    return new DrizzleRateLimitRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new SupabaseRateLimitRepository(supabase);
}

export function createUserApiKeyRepository(supabase?: SupabaseClient): IUserApiKeyRepository {
  if (getDbProvider() === 'sqlite') {
    return new SqliteUserApiKeyRepository(getSqliteDb());
  }
  if (getDbProvider() === 'postgres') {
    return new DrizzleUserApiKeyRepository(getDb());
  }
  if (!supabase) throw new Error('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  return new SupabaseUserApiKeyRepository(supabase);
}
