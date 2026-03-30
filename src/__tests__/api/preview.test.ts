import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('@/repositories/projectRepository', () => ({
  ProjectRepository: vi.fn().mockImplementation(() => ({
    findById: vi.fn(),
  })),
}));

vi.mock('@/repositories/codeRepository', () => ({
  CodeRepository: vi.fn().mockImplementation(() => ({
    findByProject: vi.fn(),
  })),
}));

vi.mock('@/lib/ai/codeParser', () => ({
  assembleHtml: vi.fn().mockReturnValue('<!DOCTYPE html><html><body>assembled</body></html>'),
}));

// ---------- Test data ----------
const mockUser = { id: 'user-1', email: 'test@test.com' };
const mockProject = {
  id: 'proj-1',
  name: '테스트 프로젝트',
  userId: 'user-1',
  context: '테스트 설명',
  status: 'draft',
};
const mockCode = {
  id: 'code-1',
  projectId: 'proj-1',
  version: 1,
  codeHtml: '<div>Hello</div>',
  codeCss: 'div { color: red; }',
  codeJs: 'console.log("hi")',
};

function makeSupabaseMock() {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) } };
}

function makeNoUserSupabaseMock() {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } };
}

function makeRequest(projectId: string, version?: number): Request {
  const url = version !== undefined
    ? `http://localhost/api/v1/preview/${projectId}?version=${version}`
    : `http://localhost/api/v1/preview/${projectId}`;
  return new Request(url, { method: 'GET' });
}

async function setupHappyPath() {
  const { createClient, createServiceClient } = await import('@/lib/supabase/server');
  vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
  vi.mocked(createServiceClient).mockResolvedValue(makeSupabaseMock() as never);

  const { ProjectRepository } = await import('@/repositories/projectRepository');
  (ProjectRepository as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    findById: vi.fn().mockResolvedValue(mockProject),
  }));

  const { CodeRepository } = await import('@/repositories/codeRepository');
  (CodeRepository as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    findByProject: vi.fn().mockResolvedValue(mockCode),
  }));
}

// ---------- Tests ----------
describe('GET /api/v1/preview/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401을 반환한다', async () => {
    const { createClient, createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeNoUserSupabaseMock() as never);
    vi.mocked(createServiceClient).mockResolvedValue(makeSupabaseMock() as never);

    const { GET } = await import('@/app/api/v1/preview/[projectId]/route');
    const response = await GET(makeRequest('proj-1'), { params: Promise.resolve({ projectId: 'proj-1' }) });
    expect(response.status).toBe(401);
  });

  it('프로젝트 없음 시 404를 반환한다', async () => {
    const { createClient, createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    vi.mocked(createServiceClient).mockResolvedValue(makeSupabaseMock() as never);

    const { ProjectRepository } = await import('@/repositories/projectRepository');
    (ProjectRepository as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      findById: vi.fn().mockResolvedValue(null),
    }));

    const { GET } = await import('@/app/api/v1/preview/[projectId]/route');
    const response = await GET(makeRequest('proj-999'), { params: Promise.resolve({ projectId: 'proj-999' }) });
    expect(response.status).toBe(404);
  });

  it('권한 없음 시 403을 반환한다', async () => {
    const { createClient, createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    vi.mocked(createServiceClient).mockResolvedValue(makeSupabaseMock() as never);

    const otherUserProject = { ...mockProject, userId: 'other-user' };
    const { ProjectRepository } = await import('@/repositories/projectRepository');
    (ProjectRepository as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      findById: vi.fn().mockResolvedValue(otherUserProject),
    }));

    const { GET } = await import('@/app/api/v1/preview/[projectId]/route');
    const response = await GET(makeRequest('proj-1'), { params: Promise.resolve({ projectId: 'proj-1' }) });
    expect(response.status).toBe(403);
  });

  it('코드 없음 시 404를 반환한다', async () => {
    const { createClient, createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    vi.mocked(createServiceClient).mockResolvedValue(makeSupabaseMock() as never);

    const { ProjectRepository } = await import('@/repositories/projectRepository');
    (ProjectRepository as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      findById: vi.fn().mockResolvedValue(mockProject),
    }));

    const { CodeRepository } = await import('@/repositories/codeRepository');
    (CodeRepository as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      findByProject: vi.fn().mockResolvedValue(null),
    }));

    const { GET } = await import('@/app/api/v1/preview/[projectId]/route');
    const response = await GET(makeRequest('proj-1'), { params: Promise.resolve({ projectId: 'proj-1' }) });
    expect(response.status).toBe(404);
  });

  it('정상 요청 시 200과 HTML 콘텐츠 및 CSP 헤더를 반환한다', async () => {
    await setupHappyPath();

    const { GET } = await import('@/app/api/v1/preview/[projectId]/route');
    const response = await GET(makeRequest('proj-1'), { params: Promise.resolve({ projectId: 'proj-1' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');

    const csp = response.headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'self'");

    const body = await response.text();
    expect(body).toContain('assembled');
  });

  it('잘못된 version 파라미터 시 400을 반환한다', async () => {
    const { createClient, createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    vi.mocked(createServiceClient).mockResolvedValue(makeSupabaseMock() as never);

    const { ProjectRepository } = await import('@/repositories/projectRepository');
    (ProjectRepository as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      findById: vi.fn().mockResolvedValue(mockProject),
    }));

    const { GET } = await import('@/app/api/v1/preview/[projectId]/route');

    // version=0 (must be >= 1)
    const response1 = await GET(makeRequest('proj-1', 0), { params: Promise.resolve({ projectId: 'proj-1' }) });
    expect(response1.status).toBe(400);
  });

  it('잘못된 version 문자열 시 400을 반환한다', async () => {
    const { createClient, createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    vi.mocked(createServiceClient).mockResolvedValue(makeSupabaseMock() as never);

    const { ProjectRepository } = await import('@/repositories/projectRepository');
    (ProjectRepository as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      findById: vi.fn().mockResolvedValue(mockProject),
    }));

    const { GET } = await import('@/app/api/v1/preview/[projectId]/route');

    const request = new Request('http://localhost/api/v1/preview/proj-1?version=abc', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ projectId: 'proj-1' }) });
    expect(response.status).toBe(400);
  });

  it('유효한 version 파라미터로 정상 요청 시 200을 반환한다', async () => {
    await setupHappyPath();

    const { GET } = await import('@/app/api/v1/preview/[projectId]/route');
    const response = await GET(makeRequest('proj-1', 2), { params: Promise.resolve({ projectId: 'proj-1' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  });
});
