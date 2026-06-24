import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/sqlite/connection', () => ({ getSqliteDb: vi.fn().mockReturnValue({}) }));
vi.mock('@/repositories/sqlite', () => ({
  SqliteProjectRepository: vi.fn(function (this: { _type: string }) { this._type = 'sqlite-project'; }),
  SqliteUserRepository: vi.fn(function (this: { _type: string }) { this._type = 'sqlite-user'; }),
  SqliteCodeRepository: vi.fn(function (this: { _type: string }) { this._type = 'sqlite-code'; }),
  SqliteCatalogRepository: vi.fn(function (this: { _type: string }) { this._type = 'sqlite-catalog'; }),
  SqliteEventRepository: vi.fn(function (this: { _type: string }) { this._type = 'sqlite-event'; }),
  SqliteRateLimitRepository: vi.fn(function (this: { _type: string }) { this._type = 'sqlite-ratelimit'; }),
  SqliteUserApiKeyRepository: vi.fn(function (this: { _type: string }) { this._type = 'sqlite-apikey'; }),
  SqliteAuthTokenRepository: vi.fn(function (this: { _type: string }) { this._type = 'sqlite-authtoken'; }),
}));

import {
  createProjectRepository,
  createUserRepository,
  createCodeRepository,
  createCatalogRepository,
  createEventRepository,
  createRateLimitRepository,
  createUserApiKeyRepository,
  createAuthTokenRepository,
} from '@/repositories/factory';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('repository factory (SQLite 단일 스택)', () => {
  it.each([
    ['createProjectRepository', createProjectRepository, 'sqlite-project'],
    ['createUserRepository', createUserRepository, 'sqlite-user'],
    ['createCodeRepository', createCodeRepository, 'sqlite-code'],
    ['createCatalogRepository', createCatalogRepository, 'sqlite-catalog'],
    ['createEventRepository', createEventRepository, 'sqlite-event'],
    ['createRateLimitRepository', createRateLimitRepository, 'sqlite-ratelimit'],
    ['createUserApiKeyRepository', createUserApiKeyRepository, 'sqlite-apikey'],
    ['createAuthTokenRepository', createAuthTokenRepository, 'sqlite-authtoken'],
  ])('%s는 SQLite 구현을 반환한다', (_name, factory, expectedType) => {
    const repo = (factory as () => unknown)() as { _type: string };
    expect(repo._type).toBe(expectedType);
  });
});
