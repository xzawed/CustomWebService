/**
 * E4: GET·DELETE /api/v1/projects/[id] 라우트 테스트 백필
 *
 * 타인 소유 격리(403)는 ownership-isolation.test.ts 가 담당하므로 여기서는 다루지 않는다.
 * params 는 Next.js App Router 규약대로 Promise 로 전달한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
// NotFoundError 는 vi.resetModules() 이후 동적 import 한다.
// 정적 import 시 라우트가 로드한 AppError 와 instanceof 가 어긋나 500 이 된다.
vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/services/factory', () => ({
  createProjectService: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------- Shared data ----------
const mockUser = { id: 'user-1', email: 'test@test.com', name: null, avatarUrl: null };
const PROJECT_ID = '11111111-1111-4111-a111-111111111111';
const mockProject = {
  id: PROJECT_ID,
  name: '테스트 프로젝트',
  userId: 'user-1',
  context: 'a'.repeat(50),
  status: 'draft' as const,
};

const routeParams = { params: Promise.resolve({ id: PROJECT_ID }) };

async function setupAuth(user: typeof mockUser | null): Promise<void> {
  const { getAuthUser } = await import('@/lib/auth/index');
  vi.mocked(getAuthUser).mockResolvedValue(user);
}

// ---------- Tests ----------
describe('GET /api/v1/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401과 AUTH_REQUIRED를 반환한다', async () => {
    await setupAuth(null);

    const { GET } = await import('@/app/api/v1/projects/[id]/route');
    const response = await GET(new Request(`http://localhost/api/v1/projects/${PROJECT_ID}`), routeParams);

    expect(response.status).toBe(401);
    const body = await response.json() as {
      success: boolean;
      error: { code: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  it('프로젝트가 없으면 404와 NOT_FOUND를 반환한다', async () => {
    await setupAuth(mockUser);

    const { NotFoundError } = await import('@/lib/utils/errors');
    const { createProjectService } = await import('@/services/factory');
    vi.mocked(createProjectService).mockReturnValue({
      getById: vi.fn().mockRejectedValue(new NotFoundError('프로젝트', PROJECT_ID)),
    } as never);

    const { GET } = await import('@/app/api/v1/projects/[id]/route');
    const response = await GET(new Request(`http://localhost/api/v1/projects/${PROJECT_ID}`), routeParams);

    expect(response.status).toBe(404);
    const body = await response.json() as {
      success: boolean;
      error: { code: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('로그인 시 프로젝트 상세를 반환한다', async () => {
    await setupAuth(mockUser);

    const getById = vi.fn().mockResolvedValue(mockProject);
    const { createProjectService } = await import('@/services/factory');
    vi.mocked(createProjectService).mockReturnValue({ getById } as never);

    const { GET } = await import('@/app/api/v1/projects/[id]/route');
    const response = await GET(new Request(`http://localhost/api/v1/projects/${PROJECT_ID}`), routeParams);

    expect(response.status).toBe(200);
    const body = await response.json() as {
      success: boolean;
      data: typeof mockProject;
    };
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: PROJECT_ID,
      name: '테스트 프로젝트',
      userId: 'user-1',
      status: 'draft',
    });
    expect(getById).toHaveBeenCalledWith(PROJECT_ID, 'user-1');
  });
});

describe('DELETE /api/v1/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401과 AUTH_REQUIRED를 반환한다', async () => {
    await setupAuth(null);

    const { DELETE } = await import('@/app/api/v1/projects/[id]/route');
    const response = await DELETE(
      new Request(`http://localhost/api/v1/projects/${PROJECT_ID}`, { method: 'DELETE' }),
      routeParams,
    );

    expect(response.status).toBe(401);
    const body = await response.json() as {
      success: boolean;
      error: { code: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  it('프로젝트가 없으면 404와 NOT_FOUND를 반환한다', async () => {
    await setupAuth(mockUser);

    const { NotFoundError } = await import('@/lib/utils/errors');
    const { createProjectService } = await import('@/services/factory');
    vi.mocked(createProjectService).mockReturnValue({
      delete: vi.fn().mockRejectedValue(new NotFoundError('프로젝트', PROJECT_ID)),
    } as never);

    const { DELETE } = await import('@/app/api/v1/projects/[id]/route');
    const response = await DELETE(
      new Request(`http://localhost/api/v1/projects/${PROJECT_ID}`, { method: 'DELETE' }),
      routeParams,
    );

    expect(response.status).toBe(404);
    const body = await response.json() as {
      success: boolean;
      error: { code: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('로그인 시 프로젝트를 삭제하고 성공 메시지를 반환한다', async () => {
    await setupAuth(mockUser);

    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const { createProjectService } = await import('@/services/factory');
    vi.mocked(createProjectService).mockReturnValue({ delete: deleteFn } as never);

    const { DELETE } = await import('@/app/api/v1/projects/[id]/route');
    const response = await DELETE(
      new Request(`http://localhost/api/v1/projects/${PROJECT_ID}`, { method: 'DELETE' }),
      routeParams,
    );

    expect(response.status).toBe(200);
    const body = await response.json() as {
      success: boolean;
      message: string;
    };
    expect(body.success).toBe(true);
    expect(body.message).toBe('프로젝트가 삭제되었습니다.');
    expect(deleteFn).toHaveBeenCalledWith(PROJECT_ID, 'user-1');
  });
});
