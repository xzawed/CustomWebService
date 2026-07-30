import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetAuthRateLimit } from '@/lib/auth/rateLimit';

vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

const findById = vi.fn();
const findByUserId = vi.fn();
const getProjectApiLinks = vi.fn();
const findAllByProject = vi.fn();
const findAllByUser = vi.fn();

vi.mock('@/repositories/factory', () => ({
  createUserRepository: () => ({ findById }),
  createProjectRepository: () => ({ findByUserId, getProjectApiLinks }),
  createCodeRepository: () => ({ findAllByProject }),
  createUserApiKeyRepository: () => ({ findAllByUser }),
}));

import { getAuthUser } from '@/lib/auth/index';

const AUTH_USER = {
  id: 'user-1',
  email: 'owner@example.com',
  name: 'Owner',
  avatarUrl: null as string | null,
};

function exportRequest(ip = '203.0.113.10'): Request {
  return new Request('https://app.example/api/v1/auth/export', {
    method: 'GET',
    headers: { 'x-forwarded-for': ip },
  });
}

describe('GET /api/v1/auth/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetAuthRateLimit();
  });

  it('비로그인 시 401', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { GET } = await import('@/app/api/v1/auth/export/route');
    const res = await GET(exportRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  it('호출자 데이터만 200으로 반환하고 다른 사용자 프로젝트는 포함하지 않는다', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(AUTH_USER);

    findById.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
      avatarUrl: null,
      preferences: { theme: 'dark' },
      passwordHash: 'scrypt$should-never-appear',
      emailVerified: '2026-06-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    });

    findByUserId.mockResolvedValue([
      {
        id: 'proj-mine',
        userId: 'user-1',
        organizationId: null,
        name: 'Mine',
        context: 'my context',
        status: 'generated',
        deployUrl: null,
        deployPlatform: null,
        repoUrl: null,
        previewUrl: null,
        metadata: {},
        currentVersion: 1,
        apis: [],
        slug: 'mine',
        publishedAt: null,
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-02T00:00:00.000Z',
      },
    ]);

    getProjectApiLinks.mockResolvedValue([{ apiId: 'api-weather', config: { units: 'metric' } }]);
    findAllByProject.mockResolvedValue([
      {
        id: 'code-1',
        projectId: 'proj-mine',
        version: 1,
        codeHtml: '<h1>hi</h1>',
        codeCss: 'body{}',
        codeJs: 'console.log(1)',
        framework: 'vanilla',
        aiProvider: 'anthropic',
        aiModel: 'claude-opus-5',
        aiPromptUsed: 'build weather app',
        generationTimeMs: 1000,
        tokenUsage: { input: 10, output: 20 },
        dependencies: [],
        metadata: { structuralScore: 80 },
        createdAt: '2026-02-01T01:00:00.000Z',
      },
    ]);

    findAllByUser.mockResolvedValue([
      {
        id: 'key-1',
        userId: 'user-1',
        apiId: 'api-weather',
        encryptedKey: 'enc:super-secret-ciphertext',
        isVerified: true,
        verifiedAt: '2026-03-01T00:00:00.000Z',
        createdAt: '2026-02-15T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ]);

    const { GET } = await import('@/app/api/v1/auth/export/route');
    const res = await GET(exportRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="customwebservice-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.schemaVersion).toBe(1);
    expect(typeof body.data.exportedAt).toBe('string');
    expect(body.data.user).toEqual({
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
      avatarUrl: null,
      preferences: { theme: 'dark' },
      emailVerified: '2026-06-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    });
    expect(body.data.projects).toHaveLength(1);
    expect(body.data.projects[0].id).toBe('proj-mine');
    expect(body.data.projects[0].projectApis).toEqual([
      { apiId: 'api-weather', config: { units: 'metric' } },
    ]);
    expect(body.data.projects[0].generatedCodes).toHaveLength(1);
    expect(body.data.projects[0].generatedCodes[0].aiPromptUsed).toBe('build weather app');
    expect(body.data.userApiKeys).toEqual([
      { apiId: 'api-weather', isVerified: true, createdAt: '2026-02-15T00:00:00.000Z' },
    ]);

    // 소유권: 레포 조회는 호출자 id 로만
    expect(findByUserId).toHaveBeenCalledWith('user-1');
    expect(findByUserId).not.toHaveBeenCalledWith('user-other');
    expect(JSON.stringify(body)).not.toContain('proj-other');
  });

  it('직렬화된 본문에 passwordHash·키 재료가 없다', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(AUTH_USER);

    findById.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      name: null,
      avatarUrl: null,
      preferences: {},
      passwordHash: 'scrypt$NEVER_EXPORT_THIS_HASH',
      emailVerified: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    findByUserId.mockResolvedValue([]);
    findAllByUser.mockResolvedValue([
      {
        id: 'key-1',
        userId: 'user-1',
        apiId: 'api-x',
        encryptedKey: 'enc:CIPHERTEXT_MUST_NOT_LEAK',
        isVerified: false,
        verifiedAt: null,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);

    const { GET } = await import('@/app/api/v1/auth/export/route');
    const res = await GET(exportRequest());
    expect(res.status).toBe(200);

    // 객체 shape가 아니라 직렬 문자열 전수 검색 — 중첩 필드 누출 방지
    const raw = await res.text();
    expect(raw).not.toMatch(/passwordHash|password_hash/i);
    expect(raw).not.toContain('scrypt$NEVER_EXPORT_THIS_HASH');
    expect(raw).not.toMatch(/encryptedKey|encrypted_key/i);
    expect(raw).not.toContain('enc:CIPHERTEXT_MUST_NOT_LEAK');
    expect(raw).not.toMatch(/auth_tokens|generation_locks|generationLocks/i);
  });

  it('코드·API가 없는 프로젝트도 빈 배열 shape를 유지한다', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(AUTH_USER);
    findById.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      name: null,
      avatarUrl: null,
      preferences: {},
      passwordHash: null,
      emailVerified: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    findByUserId.mockResolvedValue([
      {
        id: 'proj-empty',
        userId: 'user-1',
        organizationId: null,
        name: 'Empty',
        context: '',
        status: 'draft',
        deployUrl: null,
        deployPlatform: null,
        repoUrl: null,
        previewUrl: null,
        metadata: {},
        currentVersion: 0,
        apis: [],
        slug: null,
        publishedAt: null,
        createdAt: '2026-01-03T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      },
    ]);
    getProjectApiLinks.mockResolvedValue([]);
    findAllByProject.mockResolvedValue([]);
    findAllByUser.mockResolvedValue([]);

    const { GET } = await import('@/app/api/v1/auth/export/route');
    const res = await GET(exportRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.projects[0].projectApis).toEqual([]);
    expect(body.data.projects[0].generatedCodes).toEqual([]);
    expect(body.data.userApiKeys).toEqual([]);
  });

  it('동일 사용자 1시간 창에서 4번째 호출은 429', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(AUTH_USER);
    findById.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      name: null,
      avatarUrl: null,
      preferences: {},
      passwordHash: null,
      emailVerified: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    findByUserId.mockResolvedValue([]);
    findAllByUser.mockResolvedValue([]);

    const { GET } = await import('@/app/api/v1/auth/export/route');
    const ip = '198.51.100.7';

    for (let i = 0; i < 3; i++) {
      const ok = await GET(exportRequest(ip));
      expect(ok.status).toBe(200);
    }

    const limited = await GET(exportRequest(ip));
    expect(limited.status).toBe(429);
    const body = await limited.json();
    expect(body.error.code).toBe('RATE_LIMITED');
  });
});
