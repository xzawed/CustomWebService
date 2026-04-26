import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/repositories/codeRepository', () => ({
  CodeRepository: vi.fn(function() {
    return {
      findMetadataByDateRange: vi.fn().mockResolvedValue([]),
      findByProject: vi.fn().mockResolvedValue(null),
    };
  }),
}));

vi.mock('@/lib/qc', () => ({
  isQcEnabled: vi.fn().mockReturnValue(false),
  runFastQc: vi.fn().mockResolvedValue({ overallScore: 80, passed: true, checks: [] }),
  runDeepQc: vi.fn().mockResolvedValue({ overallScore: 70, passed: true, checks: [] }),
}));

vi.mock('@/lib/ai/codeParser', () => ({
  assembleHtml: vi.fn().mockReturnValue('<html><body>test</body></html>'),
}));

// ---------- Helpers ----------
const VALID_ADMIN_KEY = 'test-admin-secret-key';

function makeAdminRequest(
  path: string,
  method = 'GET',
  key: string | null = VALID_ADMIN_KEY,
  body?: unknown,
) {
  const headers: Record<string, string> = { 'x-real-ip': '127.0.0.1' };
  if (key !== null) headers['Authorization'] = `Bearer ${key}`;
  if (body) headers['Content-Type'] = 'application/json';
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------- Tests ----------
describe('Admin API 인증', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
  });

  describe('GET /api/v1/admin/qc-stats', () => {
    it('Authorization 헤더 없음 → 403', async () => {
      const { GET } = await import('@/app/api/v1/admin/qc-stats/route');
      const res = await GET(makeAdminRequest('/api/v1/admin/qc-stats', 'GET', null));
      expect(res.status).toBe(403);
    });

    it('잘못된 API 키 → 403', async () => {
      const { GET } = await import('@/app/api/v1/admin/qc-stats/route');
      const res = await GET(makeAdminRequest('/api/v1/admin/qc-stats', 'GET', 'wrong-key'));
      expect(res.status).toBe(403);
    });

    it('올바른 API 키 → 200', async () => {
      const { GET } = await import('@/app/api/v1/admin/qc-stats/route');
      const res = await GET(makeAdminRequest('/api/v1/admin/qc-stats'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('Bearer 접두사 없는 키 → 403', async () => {
      const headers = { 'x-real-ip': '127.0.0.1', Authorization: VALID_ADMIN_KEY };
      const req = new Request('http://localhost/api/v1/admin/qc-stats', { headers });
      const { GET } = await import('@/app/api/v1/admin/qc-stats/route');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('ADMIN_API_KEY 환경변수 미설정 → 403', async () => {
      delete process.env.ADMIN_API_KEY;
      const { GET } = await import('@/app/api/v1/admin/qc-stats/route');
      const res = await GET(makeAdminRequest('/api/v1/admin/qc-stats'));
      expect(res.status).toBe(403);
    });

    it('Admin rate limit 초과 → 403', async () => {
      const { GET } = await import('@/app/api/v1/admin/qc-stats/route');

      // 동일 IP에서 60회 초과 요청
      for (let i = 0; i < 60; i++) {
        await GET(makeAdminRequest('/api/v1/admin/qc-stats'));
      }
      const res = await GET(makeAdminRequest('/api/v1/admin/qc-stats'));
      // ForbiddenError → handleApiError → 403
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/admin/trigger-qc', () => {
    it('Authorization 헤더 없음 → 403', async () => {
      const { POST } = await import('@/app/api/v1/admin/trigger-qc/route');
      const res = await POST(makeAdminRequest('/api/v1/admin/trigger-qc', 'POST', null, { projectId: 'p-1' }));
      expect(res.status).toBe(403);
    });

    it('잘못된 API 키 → 403', async () => {
      const { POST } = await import('@/app/api/v1/admin/trigger-qc/route');
      const res = await POST(makeAdminRequest('/api/v1/admin/trigger-qc', 'POST', 'wrong-key', { projectId: 'p-1' }));
      expect(res.status).toBe(403);
    });

    it('QC 비활성화 상태 → 400 QC_DISABLED', async () => {
      const { isQcEnabled } = await import('@/lib/qc');
      vi.mocked(isQcEnabled).mockReturnValue(false);

      const { POST } = await import('@/app/api/v1/admin/trigger-qc/route');
      const res = await POST(makeAdminRequest('/api/v1/admin/trigger-qc', 'POST', VALID_ADMIN_KEY, { projectId: 'p-1' }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('QC_DISABLED');
    });

    it('QC 활성화 + 존재하지 않는 프로젝트 → 404 NOT_FOUND', async () => {
      const { isQcEnabled } = await import('@/lib/qc');
      vi.mocked(isQcEnabled).mockReturnValue(true);

      const { CodeRepository } = await import('@/repositories/codeRepository');
      vi.mocked(CodeRepository).mockImplementation(function() {
        return {
          findByProject: vi.fn().mockResolvedValue(null),
          findMetadataByDateRange: vi.fn().mockResolvedValue([]),
        };
      } as never);

      const { POST } = await import('@/app/api/v1/admin/trigger-qc/route');
      const res = await POST(makeAdminRequest('/api/v1/admin/trigger-qc', 'POST', VALID_ADMIN_KEY, { projectId: 'nonexistent' }));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('QC 활성화 + 프로젝트 존재 → 200 성공', async () => {
      const { isQcEnabled } = await import('@/lib/qc');
      vi.mocked(isQcEnabled).mockReturnValue(true);

      const mockCode = { codeHtml: '<div/>', codeCss: 'div{}', codeJs: '', version: 1 };
      const { CodeRepository } = await import('@/repositories/codeRepository');
      vi.mocked(CodeRepository).mockImplementation(function() {
        return {
          findByProject: vi.fn().mockResolvedValue(mockCode),
          findMetadataByDateRange: vi.fn().mockResolvedValue([]),
        };
      } as never);

      const { POST } = await import('@/app/api/v1/admin/trigger-qc/route');
      const res = await POST(makeAdminRequest('/api/v1/admin/trigger-qc', 'POST', VALID_ADMIN_KEY, { projectId: 'proj-1' }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.projectId).toBe('proj-1');
    });
  });
});
