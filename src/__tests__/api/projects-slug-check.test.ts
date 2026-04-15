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
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/config/providers', () => ({
  getDbProvider: vi.fn().mockReturnValue('supabase'),
}));

// ---------- Test data ----------
const mockUser = { id: 'user-1', email: 'test@test.com', name: null, avatarUrl: null };
const mockProject = {
  id: 'proj-1',
  name: '테스트 프로젝트',
  userId: 'user-1',
  status: 'draft',
  slug: 'my-current-slug',
};

// ---------- Tests ----------
describe('/api/v1/projects/[id]/slug/check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('1. 비로그인 시 401을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await import('@/app/api/v1/projects/[id]/slug/check/route');
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ slug: 'valid-slug' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(response.status).toBe(401);
  });

  it('2. body에 slug가 없으면 400을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createProjectRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockProject),
      findBySlug: vi.fn().mockResolvedValue(null),
    } as never);

    const { POST } = await import('@/app/api/v1/projects/[id]/slug/check/route');
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(response.status).toBe(400);
  });

  it('3. 프로젝트가 없으면 404를 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createProjectRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn().mockResolvedValue(null),
    } as never);

    const { POST } = await import('@/app/api/v1/projects/[id]/slug/check/route');
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ slug: 'valid-slug' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(response.status).toBe(404);
  });

  it('4. 프로젝트 소유자가 아니면 403을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue({ ...mockUser, id: 'other-user' });

    const { createProjectRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockProject),
      findBySlug: vi.fn().mockResolvedValue(null),
    } as never);

    const { POST } = await import('@/app/api/v1/projects/[id]/slug/check/route');
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ slug: 'valid-slug' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(response.status).toBe(403);
  });

  it('5. 유효하지 않은 slug이면 { available: false, reason: "invalid" }를 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createProjectRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockProject),
      findBySlug: vi.fn().mockResolvedValue(null),
    } as never);

    const { POST } = await import('@/app/api/v1/projects/[id]/slug/check/route');
    // 'a' 는 너무 짧아서 SLUG_REGEX 불통과 (최소 3자)
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ slug: 'a' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, data: { available: false, reason: 'invalid' } });
  });

  it('6. 예약어 slug이면 { available: false, reason: "reserved" }를 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createProjectRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockProject),
      findBySlug: vi.fn().mockResolvedValue(null),
    } as never);

    const { POST } = await import('@/app/api/v1/projects/[id]/slug/check/route');
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ slug: 'admin' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, data: { available: false, reason: 'reserved' } });
  });

  it('7. 다른 프로젝트가 이미 사용 중이면 { available: false, reason: "taken" }을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const otherProject = { ...mockProject, id: 'proj-other', slug: 'already-taken' };
    const { createProjectRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockProject),
      findBySlug: vi.fn().mockResolvedValue(otherProject),
    } as never);

    const { POST } = await import('@/app/api/v1/projects/[id]/slug/check/route');
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ slug: 'already-taken' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, data: { available: false, reason: 'taken' } });
  });

  it('8. 사용 가능한 slug이면 { available: true }를 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createProjectRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockProject),
      findBySlug: vi.fn().mockResolvedValue(null),
    } as never);

    const { POST } = await import('@/app/api/v1/projects/[id]/slug/check/route');
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ slug: 'brand-new-slug' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, data: { available: true } });
  });

  it('9. 자기 자신의 현재 slug와 동일하면 { available: true }를 반환한다 (taken 아님)', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    // findBySlug가 같은 프로젝트(proj-1)를 반환
    const { createProjectRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockProject),
      findBySlug: vi.fn().mockResolvedValue(mockProject), // same project
    } as never);

    const { POST } = await import('@/app/api/v1/projects/[id]/slug/check/route');
    // mockProject.slug = 'my-current-slug'
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ slug: 'my-current-slug' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, data: { available: true } });
  });
});
