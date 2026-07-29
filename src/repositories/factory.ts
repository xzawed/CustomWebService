import { getSqliteDb } from '@/lib/db/sqlite/connection';
import type {
  IProjectRepository,
  IUserRepository,
  ICodeRepository,
  ICatalogRepository,
  IEventRepository,
  IRateLimitRepository,
  IUserApiKeyRepository,
  IAuthTokenRepository,
  IGenerationLockRepository,
} from '@/repositories/interfaces';

// SQLite implementations — 임베디드 단일 인스턴스(유일한 DB 백엔드)
import {
  SqliteProjectRepository,
  SqliteUserRepository,
  SqliteCodeRepository,
  SqliteCatalogRepository,
  SqliteEventRepository,
  SqliteRateLimitRepository,
  SqliteUserApiKeyRepository,
  SqliteAuthTokenRepository,
  SqliteGenerationLockRepository,
} from '@/repositories/sqlite';

export function createProjectRepository(): IProjectRepository {
  return new SqliteProjectRepository(getSqliteDb());
}

export function createUserRepository(): IUserRepository {
  return new SqliteUserRepository(getSqliteDb());
}

export function createCodeRepository(): ICodeRepository {
  return new SqliteCodeRepository(getSqliteDb());
}

export function createCatalogRepository(): ICatalogRepository {
  return new SqliteCatalogRepository(getSqliteDb());
}

export function createEventRepository(): IEventRepository {
  return new SqliteEventRepository(getSqliteDb());
}

export function createRateLimitRepository(): IRateLimitRepository {
  return new SqliteRateLimitRepository(getSqliteDb());
}

export function createUserApiKeyRepository(): IUserApiKeyRepository {
  return new SqliteUserApiKeyRepository(getSqliteDb());
}

export function createAuthTokenRepository(): IAuthTokenRepository {
  return new SqliteAuthTokenRepository(getSqliteDb());
}

export function createGenerationLockRepository(): IGenerationLockRepository {
  return new SqliteGenerationLockRepository(getSqliteDb());
}
