import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.stubEnv('RAILWAY_TOKEN', 'test-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// ── Response helpers ──────────────────────────────────────────────────────────

function gqlResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ data }),
  };
}

function gqlError(message: string) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ errors: [{ message }] }),
  };
}

function httpError(status: number) {
  return { ok: false, status, json: vi.fn() };
}

// ── graphql() 공통 동작 ───────────────────────────────────────────────────────

describe('graphql() — 공통 에러 처리', () => {
  it('RAILWAY_TOKEN 미설정 → "RAILWAY_TOKEN is not set" throw', async () => {
    vi.stubEnv('RAILWAY_TOKEN', '');

    const { createProject } = await import('./railwayService');
    await expect(createProject('my-app')).rejects.toThrow('RAILWAY_TOKEN is not set');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('HTTP 에러 (500) → "Railway API error: 500" throw', async () => {
    mockFetch.mockResolvedValueOnce(httpError(500));

    const { createProject } = await import('./railwayService');
    await expect(createProject('my-app')).rejects.toThrow('Railway API error: 500');
  });

  it('GraphQL errors 배열 포함 → "Railway GraphQL error: ..." throw', async () => {
    mockFetch.mockResolvedValueOnce(gqlError('Project limit reached'));

    const { createProject } = await import('./railwayService');
    await expect(createProject('my-app')).rejects.toThrow(
      'Railway GraphQL error: Project limit reached',
    );
  });
});

// ── createProject ─────────────────────────────────────────────────────────────

describe('createProject()', () => {
  it('성공 → RailwayProject 반환', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({ projectCreate: { id: 'rp1', name: 'my-app' } }),
    );

    const { createProject } = await import('./railwayService');
    const result = await createProject('my-app');

    expect(result).toEqual({ id: 'rp1', name: 'my-app' });
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://backboard.railway.com/graphql/v2',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('요청 body에 name 변수 포함', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({ projectCreate: { id: 'rp2', name: 'service-x' } }),
    );

    const { createProject } = await import('./railwayService');
    await createProject('service-x');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables).toEqual({ input: { name: 'service-x' } });
  });
});

// ── createServiceFromRepo ─────────────────────────────────────────────────────

describe('createServiceFromRepo()', () => {
  it('성공 → service id 반환', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({ serviceCreate: { id: 'svc1' } }),
    );

    const { createServiceFromRepo } = await import('./railwayService');
    const result = await createServiceFromRepo('rp1', 'org/repo');

    expect(result).toBe('svc1');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('요청 body에 projectId와 repo 변수 포함', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({ serviceCreate: { id: 'svc2' } }),
    );

    const { createServiceFromRepo } = await import('./railwayService');
    await createServiceFromRepo('rp1', 'myorg/myrepo');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables.input.projectId).toBe('rp1');
    expect(body.variables.input.source.repo).toBe('myorg/myrepo');
  });
});

// ── setEnvironmentVariables ───────────────────────────────────────────────────

describe('setEnvironmentVariables()', () => {
  it('환경 있음 → 2회 fetch (query + mutation)', async () => {
    mockFetch
      .mockResolvedValueOnce(
        gqlResponse({
          environments: { edges: [{ node: { id: 'env1' } }] },
        }),
      )
      .mockResolvedValueOnce(gqlResponse({ variableCollectionUpsert: true }));

    const { setEnvironmentVariables } = await import('./railwayService');
    await expect(
      setEnvironmentVariables('rp1', 'svc1', { KEY: 'val', DB: 'postgres://' }),
    ).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('mutation body에 environmentId, variables 포함', async () => {
    mockFetch
      .mockResolvedValueOnce(
        gqlResponse({
          environments: { edges: [{ node: { id: 'env-abc' } }] },
        }),
      )
      .mockResolvedValueOnce(gqlResponse({ variableCollectionUpsert: true }));

    const { setEnvironmentVariables } = await import('./railwayService');
    await setEnvironmentVariables('rp1', 'svc1', { SECRET: 'value' });

    const mutationBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(mutationBody.variables.input.environmentId).toBe('env-abc');
    expect(mutationBody.variables.input.variables).toEqual({ SECRET: 'value' });
    expect(mutationBody.variables.input.serviceId).toBe('svc1');
    expect(mutationBody.variables.input.projectId).toBe('rp1');
  });

  it('환경 없음 → logger.warn 후 early return (fetch 1회만 호출)', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({ environments: { edges: [] } }),
    );

    const { setEnvironmentVariables } = await import('./railwayService');
    const { logger } = await import('@/lib/utils/logger');

    await expect(
      setEnvironmentVariables('rp1', 'svc1', { KEY: 'val' }),
    ).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'No environment found for Railway project',
      expect.objectContaining({ projectId: 'rp1' }),
    );
  });
});

// ── triggerDeploy ─────────────────────────────────────────────────────────────

describe('triggerDeploy()', () => {
  it('성공 → deploy id 문자열 반환', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({ serviceInstanceRedeploy: 'deploy-123' }),
    );

    const { triggerDeploy } = await import('./railwayService');
    const result = await triggerDeploy('svc1');

    expect(result).toBe('deploy-123');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('요청 body에 serviceId 변수 포함', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({ serviceInstanceRedeploy: 'deploy-xyz' }),
    );

    const { triggerDeploy } = await import('./railwayService');
    await triggerDeploy('svc-abc');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables.serviceId).toBe('svc-abc');
  });
});

// ── getDeploymentStatus ───────────────────────────────────────────────────────

describe('getDeploymentStatus()', () => {
  it('배포 있음 + staticUrl 있음 → { id, status, url } 반환', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({
        deployments: {
          edges: [{ node: { id: 'dep1', status: 'SUCCESS', staticUrl: 'my-app.up.railway.app' } }],
        },
      }),
    );

    const { getDeploymentStatus } = await import('./railwayService');
    const result = await getDeploymentStatus('rp1');

    expect(result).toEqual({
      id: 'dep1',
      status: 'SUCCESS',
      url: 'https://my-app.up.railway.app',
    });
  });

  it('staticUrl null → url이 undefined', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({
        deployments: {
          edges: [{ node: { id: 'dep2', status: 'BUILDING', staticUrl: null } }],
        },
      }),
    );

    const { getDeploymentStatus } = await import('./railwayService');
    const result = await getDeploymentStatus('rp1');

    expect(result).toEqual({ id: 'dep2', status: 'BUILDING', url: undefined });
  });

  it('배포 없음 → null 반환', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({ deployments: { edges: [] } }),
    );

    const { getDeploymentStatus } = await import('./railwayService');
    const result = await getDeploymentStatus('rp1');

    expect(result).toBeNull();
  });
});

// ── getServiceDomain ──────────────────────────────────────────────────────────

describe('getServiceDomain()', () => {
  it('도메인 있음 → "https://..." 반환', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({
        serviceDomains: {
          serviceDomains: [{ domain: 'my-service.up.railway.app' }],
        },
      }),
    );

    const { getServiceDomain } = await import('./railwayService');
    const result = await getServiceDomain('svc1');

    expect(result).toBe('https://my-service.up.railway.app');
  });

  it('도메인 없음 → null 반환', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({
        serviceDomains: { serviceDomains: [] },
      }),
    );

    const { getServiceDomain } = await import('./railwayService');
    const result = await getServiceDomain('svc1');

    expect(result).toBeNull();
  });
});

// ── generateServiceDomain ─────────────────────────────────────────────────────

describe('generateServiceDomain()', () => {
  it('성공 → "https://..." 반환', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({
        serviceDomainCreate: { domain: 'generated.up.railway.app' },
      }),
    );

    const { generateServiceDomain } = await import('./railwayService');
    const result = await generateServiceDomain('svc1', 'env1');

    expect(result).toBe('https://generated.up.railway.app');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('요청 body에 serviceId와 environmentId 포함', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({
        serviceDomainCreate: { domain: 'new-domain.up.railway.app' },
      }),
    );

    const { generateServiceDomain } = await import('./railwayService');
    await generateServiceDomain('svc-xyz', 'env-abc');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables.input.serviceId).toBe('svc-xyz');
    expect(body.variables.input.environmentId).toBe('env-abc');
  });
});

// ── deleteProject ─────────────────────────────────────────────────────────────

describe('deleteProject()', () => {
  it('성공 → fetch 1회 호출, void 반환', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({ projectDelete: true }),
    );

    const { deleteProject } = await import('./railwayService');
    await expect(deleteProject('rp1')).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('요청 body에 id 변수 포함', async () => {
    mockFetch.mockResolvedValueOnce(
      gqlResponse({ projectDelete: true }),
    );

    const { deleteProject } = await import('./railwayService');
    await deleteProject('project-123');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables.id).toBe('project-123');
  });

  it('GraphQL 에러 → throw', async () => {
    mockFetch.mockResolvedValueOnce(gqlError('Project not found'));

    const { deleteProject } = await import('./railwayService');
    await expect(deleteProject('rp-not-exist')).rejects.toThrow(
      'Railway GraphQL error: Project not found',
    );
  });
});
