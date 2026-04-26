import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/repositories/factory', () => ({
  createProjectRepository: vi.fn().mockReturnValue({ _type: 'project-repo' }),
  createCatalogRepository: vi.fn().mockReturnValue({ _type: 'catalog-repo' }),
  createCodeRepository: vi.fn().mockReturnValue({ _type: 'code-repo' }),
  createRateLimitRepository: vi.fn().mockReturnValue({ _type: 'ratelimit-repo' }),
}));
vi.mock('@/services/projectService', () => ({
  ProjectService: vi.fn(function (this: { _type: string }) {
    this._type = 'ProjectService';
  }),
}));
vi.mock('@/services/catalogService', () => ({
  CatalogService: vi.fn(function (this: { _type: string }) {
    this._type = 'CatalogService';
  }),
}));
vi.mock('@/services/deployService', () => ({
  DeployService: vi.fn(function (this: { _type: string }) {
    this._type = 'DeployService';
  }),
}));
vi.mock('@/services/rateLimitService', () => ({
  RateLimitService: vi.fn(function (this: { _type: string }) {
    this._type = 'RateLimitService';
  }),
}));

import {
  createProjectService,
  createCatalogService,
  createDeployService,
  createRateLimitService,
} from '@/services/factory';
import {
  createProjectRepository,
  createCatalogRepository,
  createCodeRepository,
  createRateLimitRepository,
} from '@/repositories/factory';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createProjectService', () => {
  it('returns a ProjectService instance', () => {
    const svc = createProjectService() as unknown as { _type: string };
    expect(svc._type).toBe('ProjectService');
  });

  it('passes the supabase client to repository factory calls', () => {
    const mockClient = {} as unknown as SupabaseClient;
    createProjectService(mockClient);
    expect(createProjectRepository).toHaveBeenCalledWith(mockClient);
    expect(createCatalogRepository).toHaveBeenCalledWith(mockClient);
  });
});

describe('createCatalogService', () => {
  it('returns a CatalogService instance', () => {
    const svc = createCatalogService() as unknown as { _type: string };
    expect(svc._type).toBe('CatalogService');
  });

  it('passes the supabase client to createCatalogRepository', () => {
    const mockClient = {} as unknown as SupabaseClient;
    createCatalogService(mockClient);
    expect(createCatalogRepository).toHaveBeenCalledWith(mockClient);
  });
});

describe('createDeployService', () => {
  it('returns a DeployService instance', () => {
    const svc = createDeployService() as unknown as { _type: string };
    expect(svc._type).toBe('DeployService');
  });

  it('passes the supabase client to repository factory calls', () => {
    const mockClient = {} as unknown as SupabaseClient;
    createDeployService(mockClient);
    expect(createProjectRepository).toHaveBeenCalledWith(mockClient);
    expect(createCodeRepository).toHaveBeenCalledWith(mockClient);
  });
});

describe('createRateLimitService', () => {
  it('returns a RateLimitService instance', () => {
    const svc = createRateLimitService() as unknown as { _type: string };
    expect(svc._type).toBe('RateLimitService');
  });

  it('passes the supabase client to createRateLimitRepository', () => {
    const mockClient = {} as unknown as SupabaseClient;
    createRateLimitService(mockClient);
    expect(createRateLimitRepository).toHaveBeenCalledWith(mockClient);
  });
});
