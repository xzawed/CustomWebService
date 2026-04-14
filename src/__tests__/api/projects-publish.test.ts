import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/services/factory', () => ({
  createProjectService: vi.fn(),
}));

vi.mock('@/repositories/factory', () => ({
  createCodeRepository: vi.fn(),
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
  status: 'published',
  slug: 'test-project',
};

// ---------- Tests ----------
describe('/api/v1/projects/[id]/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // ---- POST ----
  describe('POST', () => {
    it('비로그인 시 401을 반환한다', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(null);

      const { POST } = await import('@/app/api/v1/projects/[id]/publish/route');
      const response = await POST(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'proj-1' }),
      });
      expect(response.status).toBe(401);
    });

    it('해피패스: publish를 호출하고 { success: true, data: project }를 반환한다', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCodeRepository } = await import('@/repositories/factory');
      vi.mocked(createCodeRepository).mockReturnValue({
        findByProject: vi.fn().mockResolvedValue(null),
      } as never);

      const publishMock = vi.fn().mockResolvedValue(mockProject);
      const { createProjectService } = await import('@/services/factory');
      vi.mocked(createProjectService).mockReturnValue({
        publish: publishMock,
      } as never);

      const { POST } = await import('@/app/api/v1/projects/[id]/publish/route');
      const response = await POST(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'proj-1' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ success: true, data: mockProject });
      expect(publishMock).toHaveBeenCalledWith('proj-1', 'user-1');
    });

    it('renderingQcPassed=false인 경우 qcWarnings를 응답에 포함한다', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCodeRepository } = await import('@/repositories/factory');
      vi.mocked(createCodeRepository).mockReturnValue({
        findByProject: vi.fn().mockResolvedValue({
          metadata: {
            renderingQcPassed: false,
            renderingQcScore: 45,
            renderingQcChecks: [{ name: 'footerVisible', passed: false, details: ['footer 미존재'] }],
          },
        }),
      } as never);

      const { createProjectService } = await import('@/services/factory');
      vi.mocked(createProjectService).mockReturnValue({
        publish: vi.fn().mockResolvedValue(mockProject),
      } as never);

      const { POST } = await import('@/app/api/v1/projects/[id]/publish/route');
      const response = await POST(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'proj-1' }),
      });

      const body = await response.json();
      expect(body.qcWarnings).toBeDefined();
      expect(body.qcWarnings.length).toBeGreaterThan(0);
      expect(body.qcWarnings[0]).toContain('렌더링 QC 미통과');
    });
  });

  // ---- DELETE ----
  describe('DELETE', () => {
    it('해피패스: unpublish를 호출하고 프로젝트를 반환한다', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const unpublishedProject = { ...mockProject, status: 'generated' };
      const unpublishMock = vi.fn().mockResolvedValue(unpublishedProject);
      const { createProjectService } = await import('@/services/factory');
      vi.mocked(createProjectService).mockReturnValue({
        unpublish: unpublishMock,
      } as never);

      const { DELETE } = await import('@/app/api/v1/projects/[id]/publish/route');
      const response = await DELETE(new Request('http://localhost'), {
        params: Promise.resolve({ id: 'proj-1' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ success: true, data: unpublishedProject });
      expect(unpublishMock).toHaveBeenCalledWith('proj-1', 'user-1');
    });
  });
});
