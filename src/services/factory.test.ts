import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/repositories/factory', () => ({
  createProjectRepository: vi.fn().mockReturnValue({ _type: 'project-repo' }),
  createCatalogRepository: vi.fn().mockReturnValue({ _type: 'catalog-repo' }),
  createCodeRepository: vi.fn().mockReturnValue({ _type: 'code-repo' }),
  createRateLimitRepository: vi.fn().mockReturnValue({ _type: 'ratelimit-repo' }),
  createUserRepository: vi.fn().mockReturnValue({ _type: 'user-repo' }),
  createAuthTokenRepository: vi.fn().mockReturnValue({ _type: 'authtoken-repo' }),
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
vi.mock('@/services/authService', () => ({
  AuthService: vi.fn(function (this: { _type: string }) {
    this._type = 'AuthService';
  }),
}));
vi.mock('@/lib/email/emailService', () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

import {
  createProjectService,
  createCatalogService,
  createDeployService,
  createRateLimitService,
  createAuthService,
} from '@/services/factory';
import {
  createProjectRepository,
  createCatalogRepository,
  createCodeRepository,
  createRateLimitRepository,
  createUserRepository,
  createAuthTokenRepository,
} from '@/repositories/factory';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createProjectService', () => {
  it('returns a ProjectService instance', () => {
    const svc = createProjectService() as unknown as { _type: string };
    expect(svc._type).toBe('ProjectService');
  });

  it('repository 팩토리를 인자 없이 호출한다', () => {
    createProjectService();
    expect(createProjectRepository).toHaveBeenCalledWith();
    expect(createCatalogRepository).toHaveBeenCalledWith();
  });
});

describe('createCatalogService', () => {
  it('returns a CatalogService instance', () => {
    const svc = createCatalogService() as unknown as { _type: string };
    expect(svc._type).toBe('CatalogService');
  });

  it('createCatalogRepository를 인자 없이 호출한다', () => {
    createCatalogService();
    expect(createCatalogRepository).toHaveBeenCalledWith();
  });
});

describe('createDeployService', () => {
  it('returns a DeployService instance', () => {
    const svc = createDeployService() as unknown as { _type: string };
    expect(svc._type).toBe('DeployService');
  });

  it('repository 팩토리를 인자 없이 호출한다', () => {
    createDeployService();
    expect(createProjectRepository).toHaveBeenCalledWith();
    expect(createCodeRepository).toHaveBeenCalledWith();
  });
});

describe('createRateLimitService', () => {
  it('returns a RateLimitService instance', () => {
    const svc = createRateLimitService() as unknown as { _type: string };
    expect(svc._type).toBe('RateLimitService');
  });

  it('createRateLimitRepository를 인자 없이 호출한다', () => {
    createRateLimitService();
    expect(createRateLimitRepository).toHaveBeenCalledWith();
  });
});

describe('createAuthService', () => {
  it('returns an AuthService instance', () => {
    const svc = createAuthService() as unknown as { _type: string };
    expect(svc._type).toBe('AuthService');
  });

  it('repository 팩토리를 인자 없이 호출한다', () => {
    createAuthService();
    expect(createUserRepository).toHaveBeenCalledWith();
    expect(createAuthTokenRepository).toHaveBeenCalledWith();
  });
});
