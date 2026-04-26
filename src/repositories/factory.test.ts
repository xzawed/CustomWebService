import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/config/providers', () => ({ getDbProvider: vi.fn() }));
vi.mock('@/lib/db/connection', () => ({ getDb: vi.fn().mockReturnValue({}) }));
vi.mock('@/repositories/projectRepository', () => ({
  ProjectRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'supabase-project';
  }),
}));
vi.mock('@/repositories/userRepository', () => ({
  UserRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'supabase-user';
  }),
}));
vi.mock('@/repositories/codeRepository', () => ({
  CodeRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'supabase-code';
  }),
}));
vi.mock('@/repositories/catalogRepository', () => ({
  CatalogRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'supabase-catalog';
  }),
}));
vi.mock('@/repositories/eventRepository', () => ({
  EventRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'supabase-event';
  }),
}));
vi.mock('@/repositories/supabaseRateLimitRepository', () => ({
  SupabaseRateLimitRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'supabase-ratelimit';
  }),
}));
vi.mock('@/repositories/supabaseUserApiKeyRepository', () => ({
  SupabaseUserApiKeyRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'supabase-apikey';
  }),
}));
vi.mock('@/repositories/drizzle', () => ({
  DrizzleProjectRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'drizzle-project';
  }),
  DrizzleUserRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'drizzle-user';
  }),
  DrizzleCodeRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'drizzle-code';
  }),
  DrizzleCatalogRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'drizzle-catalog';
  }),
  DrizzleEventRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'drizzle-event';
  }),
  DrizzleRateLimitRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'drizzle-ratelimit';
  }),
  DrizzleUserApiKeyRepository: vi.fn(function (this: { _type: string }) {
    this._type = 'drizzle-apikey';
  }),
}));

import { getDbProvider } from '@/lib/config/providers';
import {
  createProjectRepository,
  createUserRepository,
  createCodeRepository,
  createCatalogRepository,
  createEventRepository,
  createRateLimitRepository,
  createUserApiKeyRepository,
} from '@/repositories/factory';

const mockGetDbProvider = getDbProvider as ReturnType<typeof vi.fn>;
const mockClient = {} as unknown as SupabaseClient;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createProjectRepository', () => {
  it('returns a Drizzle instance when provider is postgres', () => {
    mockGetDbProvider.mockReturnValue('postgres');
    const repo = createProjectRepository() as unknown as { _type: string };
    expect(repo._type).toContain('drizzle-');
  });

  it('returns a Supabase instance when provider is supabase with client', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    const repo = createProjectRepository(mockClient) as unknown as { _type: string };
    expect(repo._type).toContain('supabase-');
  });

  it('throws when provider is supabase and no client is passed', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    expect(() => createProjectRepository()).toThrow('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  });
});

describe('createUserRepository', () => {
  it('returns a Drizzle instance when provider is postgres', () => {
    mockGetDbProvider.mockReturnValue('postgres');
    const repo = createUserRepository() as unknown as { _type: string };
    expect(repo._type).toContain('drizzle-');
  });

  it('returns a Supabase instance when provider is supabase with client', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    const repo = createUserRepository(mockClient) as unknown as { _type: string };
    expect(repo._type).toContain('supabase-');
  });

  it('throws when provider is supabase and no client is passed', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    expect(() => createUserRepository()).toThrow('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  });
});

describe('createCodeRepository', () => {
  it('returns a Drizzle instance when provider is postgres', () => {
    mockGetDbProvider.mockReturnValue('postgres');
    const repo = createCodeRepository() as unknown as { _type: string };
    expect(repo._type).toContain('drizzle-');
  });

  it('returns a Supabase instance when provider is supabase with client', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    const repo = createCodeRepository(mockClient) as unknown as { _type: string };
    expect(repo._type).toContain('supabase-');
  });

  it('throws when provider is supabase and no client is passed', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    expect(() => createCodeRepository()).toThrow('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  });
});

describe('createCatalogRepository', () => {
  it('returns a Drizzle instance when provider is postgres', () => {
    mockGetDbProvider.mockReturnValue('postgres');
    const repo = createCatalogRepository() as unknown as { _type: string };
    expect(repo._type).toContain('drizzle-');
  });

  it('returns a Supabase instance when provider is supabase with client', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    const repo = createCatalogRepository(mockClient) as unknown as { _type: string };
    expect(repo._type).toContain('supabase-');
  });

  it('throws when provider is supabase and no client is passed', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    expect(() => createCatalogRepository()).toThrow('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  });
});

describe('createEventRepository', () => {
  it('returns a Drizzle instance when provider is postgres', () => {
    mockGetDbProvider.mockReturnValue('postgres');
    const repo = createEventRepository() as unknown as { _type: string };
    expect(repo._type).toContain('drizzle-');
  });

  it('returns a Supabase instance when provider is supabase with client', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    const repo = createEventRepository(mockClient) as unknown as { _type: string };
    expect(repo._type).toContain('supabase-');
  });

  it('throws when provider is supabase and no client is passed', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    expect(() => createEventRepository()).toThrow('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  });
});

describe('createRateLimitRepository', () => {
  it('returns a Drizzle instance when provider is postgres', () => {
    mockGetDbProvider.mockReturnValue('postgres');
    const repo = createRateLimitRepository() as unknown as { _type: string };
    expect(repo._type).toContain('drizzle-');
  });

  it('returns a Supabase instance when provider is supabase with client', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    const repo = createRateLimitRepository(mockClient) as unknown as { _type: string };
    expect(repo._type).toContain('supabase-');
  });

  it('throws when provider is supabase and no client is passed', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    expect(() => createRateLimitRepository()).toThrow('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  });
});

describe('createUserApiKeyRepository', () => {
  it('returns a Drizzle instance when provider is postgres', () => {
    mockGetDbProvider.mockReturnValue('postgres');
    const repo = createUserApiKeyRepository() as unknown as { _type: string };
    expect(repo._type).toContain('drizzle-');
  });

  it('returns a Supabase instance when provider is supabase with client', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    const repo = createUserApiKeyRepository(mockClient) as unknown as { _type: string };
    expect(repo._type).toContain('supabase-');
  });

  it('throws when provider is supabase and no client is passed', () => {
    mockGetDbProvider.mockReturnValue('supabase');
    expect(() => createUserApiKeyRepository()).toThrow('Supabase 모드에서는 SupabaseClient가 필요합니다.');
  });
});
