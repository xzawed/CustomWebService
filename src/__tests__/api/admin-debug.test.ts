import { describe, it, expect, vi, beforeEach } from 'vitest';

const VALID_ADMIN_KEY = 'test-admin-secret-key';

// createRequire mock — tryRequire 성공/실패 모두 테스트
const requireMock = vi.fn();
vi.mock('node:module', () => ({
  createRequire: vi.fn(() => requireMock),
}));

vi.mock('@/lib/utils/adminAuth', () => ({
  adminCorsHeaders: { 'Access-Control-Allow-Origin': '*' },
  verifyAdminKey: vi.fn(),
  withAdminCors: vi.fn((res: Response) => res),
}));

vi.mock('@/lib/utils/errors', async () => {
  const { AuthRequiredError } = await import('@/lib/utils/errors');
  return {
    jsonResponse: vi.fn((data: unknown) =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
    handleApiError: vi.fn((err: unknown) => {
      if (err instanceof AuthRequiredError) {
        return new Response(JSON.stringify({ error: { code: 'AUTH_REQUIRED' } }), { status: 401 });
      }
      return new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }), { status: 500 });
    }),
    AuthRequiredError,
  };
});

function makeRequest(method = 'GET') {
  return new Request('http://localhost/api/v1/admin/debug', {
    method,
    headers: { Authorization: `Bearer ${VALID_ADMIN_KEY}` },
  });
}

describe('GET /api/v1/admin/debug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMock.mockReturnValue({});
  });

  it('OPTIONS 요청에 204를 반환한다', async () => {
    const { OPTIONS } = await import('@/app/api/v1/admin/debug/route');
    const response = await OPTIONS();
    expect(response.status).toBe(204);
  });

  it('인증된 요청에 모듈 진단 결과를 반환한다', async () => {
    const { GET } = await import('@/app/api/v1/admin/debug/route');
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    const body = await response.json() as { success: boolean; data: { modules: Record<string, string> } };
    expect(body.success).toBe(true);
    expect(body.data.modules['playwright-core']).toBe('ok');
    expect(body.data.modules['pg']).toBe('ok');
    expect(body.data.modules['@anthropic-ai/sdk']).toBe('ok');
  });

  it('모듈 로드 실패 시 FAIL: 접두사 문자열을 반환한다', async () => {
    requireMock.mockImplementation((id: string) => {
      if (id === 'playwright-core') throw new Error('Cannot find module');
    });

    const { GET } = await import('@/app/api/v1/admin/debug/route');
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    const body = await response.json() as { data: { modules: Record<string, string> } };
    expect(body.data.modules['playwright-core']).toMatch(/^FAIL:/);
    expect(body.data.modules['pg']).toBe('ok');
  });

  it('환경 정보(nodeVersion, platform, arch, nodeEnv)를 포함한다', async () => {
    const { GET } = await import('@/app/api/v1/admin/debug/route');
    const response = await GET(makeRequest());

    const body = await response.json() as {
      data: { nodeVersion: string; platform: string; arch: string; nodeEnv: string | undefined }
    };
    expect(body.data.nodeVersion).toMatch(/^v\d+/);
    expect(body.data.platform).toBeTruthy();
    expect(body.data.arch).toBeTruthy();
  });

  it('어드민 키 검증 실패 시 handleApiError를 통해 처리된다', async () => {
    const { verifyAdminKey } = await import('@/lib/utils/adminAuth');
    const { AuthRequiredError } = await import('@/lib/utils/errors');
    vi.mocked(verifyAdminKey).mockImplementationOnce(() => {
      throw new AuthRequiredError();
    });

    const { GET } = await import('@/app/api/v1/admin/debug/route');
    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
  });

  it('Error 인스턴스가 아닌 예외도 문자열로 변환된다', async () => {
    requireMock.mockImplementation((id: string) => {
      if (id === 'drizzle-orm') throw 'module not found string error';
    });

    const { GET } = await import('@/app/api/v1/admin/debug/route');
    const response = await GET(makeRequest());

    const body = await response.json() as { data: { modules: Record<string, string> } };
    expect(body.data.modules['drizzle-orm']).toMatch(/^FAIL:/);
  });
});
