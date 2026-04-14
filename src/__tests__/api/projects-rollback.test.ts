import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/repositories/factory', () => ({
  createProjectRepository: vi.fn(),
  createCodeRepository: vi.fn(),
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/config/providers', () => ({
  getDbProvider: vi.fn().mockReturnValue('supabase'),
}));

// ---------- Test data ----------
const mockUser = { id: 'user-1', email: 'test@test.com', name: null, avatarUrl: null };
const mockProject = { id: 'proj-1', userId: 'user-1', status: 'generated' };
const mockTargetCode = {
  id: 'code-v1',
  projectId: 'proj-1',
  version: 1,
  codeHtml: '<html>v1</html>',
  codeCss: '',
  codeJs: '',
  framework: 'html',
  aiProvider: 'claude',
  aiModel: 'claude-sonnet-4-6',
  aiPromptUsed: '',
  dependencies: [],
  metadata: { structuralScore: 80 },
};

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/v1/projects/proj-1/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------- Tests ----------
describe('POST /api/v1/projects/[id]/rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await import('@/app/api/v1/projects/[id]/rollback/route');
    const response = await POST(makeRequest({ version: 1 }), {
      params: Promise.resolve({ id: 'proj-1' }),
    });
    expect(response.status).toBe(401);
  });

  it('프로젝트가 존재하지 않거나 소유자가 아니면 404를 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createProjectRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    } as never);

    const { POST } = await import('@/app/api/v1/projects/[id]/rollback/route');
    const response = await POST(makeRequest({ version: 1 }), {
      params: Promise.resolve({ id: 'proj-1' }),
    });
    expect(response.status).toBe(404);
  });

  it('다른 사용자의 프로젝트면 404를 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createProjectRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue({ ...mockProject, userId: 'other-user' }),
      update: vi.fn(),
    } as never);

    const { POST } = await import('@/app/api/v1/projects/[id]/rollback/route');
    const response = await POST(makeRequest({ version: 1 }), {
      params: Promise.resolve({ id: 'proj-1' }),
    });
    expect(response.status).toBe(404);
  });

  it('version 필드가 누락되거나 유효하지 않으면 400을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createProjectRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockProject),
      update: vi.fn(),
    } as never);

    const { POST } = await import('@/app/api/v1/projects/[id]/rollback/route');
    const response = await POST(makeRequest({ version: 'abc' }), {
      params: Promise.resolve({ id: 'proj-1' }),
    });
    expect(response.status).toBe(400);
  });

  it('잘못된 JSON이면 400을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createProjectRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockProject),
      update: vi.fn(),
    } as never);

    const { POST } = await import('@/app/api/v1/projects/[id]/rollback/route');
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'proj-1' }) });
    expect(response.status).toBe(400);
  });

  it('존재하지 않는 버전이면 404를 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createProjectRepository, createCodeRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockProject),
      update: vi.fn(),
    } as never);
    vi.mocked(createCodeRepository).mockReturnValue({
      findByProject: vi.fn().mockResolvedValue(null),
      getNextVersion: vi.fn(),
      create: vi.fn(),
    } as never);

    const { POST } = await import('@/app/api/v1/projects/[id]/rollback/route');
    const response = await POST(makeRequest({ version: 99 }), {
      params: Promise.resolve({ id: 'proj-1' }),
    });
    expect(response.status).toBe(404);
  });

  it('해피패스: rolledBackFrom 포함 새 버전 생성, projectRepo.update, CODE_GENERATED 이벤트 발생', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const updateMock = vi.fn().mockResolvedValue(undefined);
    const { createProjectRepository, createCodeRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockProject),
      update: updateMock,
    } as never);

    const createMock = vi.fn().mockResolvedValue({ ...mockTargetCode, version: 2, id: 'code-v2' });
    vi.mocked(createCodeRepository).mockReturnValue({
      findByProject: vi.fn().mockResolvedValue(mockTargetCode),
      getNextVersion: vi.fn().mockResolvedValue(2),
      create: createMock,
    } as never);

    const { eventBus } = await import('@/lib/events/eventBus');

    const { POST } = await import('@/app/api/v1/projects/[id]/rollback/route');
    const response = await POST(makeRequest({ version: 1 }), {
      params: Promise.resolve({ id: 'proj-1' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ projectId: 'proj-1', version: 2, rolledBackFrom: 1 });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ rolledBackFrom: 1 }) })
    );
    expect(updateMock).toHaveBeenCalled();
    expect(vi.mocked(eventBus.emit)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CODE_GENERATED' })
    );
  });
});
