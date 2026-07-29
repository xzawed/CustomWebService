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
    vi.resetModules();
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
    expect(body.data.modules['better-sqlite3']).toBe('ok');
    expect(body.data.modules['@anthropic-ai/sdk']).toBe('ok');
  });

  // 2026-07-10에 AI_MODEL_GENERATION이 허용목록에 없어 조용히 구모델로 폴백 중이던 것을
  // 뒤늦게 발견한 적이 있다. env 값만 봐서는 실제 적용 모델을 알 수 없으므로 노출한다.
  describe('모델 해석 진단', () => {
    it('env 값과 실제 해석된 모델을 태스크별로 함께 반환한다', async () => {
      process.env.AI_MODEL_GENERATION = 'claude-opus-5';
      process.env.AI_MODEL_SUGGESTION = 'claude-haiku-4-5';

      const { GET } = await import('@/app/api/v1/admin/debug/route');
      const body = await (await GET(makeRequest())).json() as {
        data: { models: Record<string, { env: string | null; resolved: string; fellBack: boolean }> }
      };

      expect(body.data.models.generation).toEqual({
        env: 'claude-opus-5', resolved: 'claude-opus-5', fellBack: false,
      });
      expect(body.data.models.suggestion.resolved).toBe('claude-haiku-4-5');
    });

    it('허용목록에 없는 env는 fellBack=true로 드러난다 — 조용한 폴백을 눈에 보이게 한다', async () => {
      process.env.AI_MODEL_GENERATION = 'claude-opus-9-nonexistent';

      const { GET } = await import('@/app/api/v1/admin/debug/route');
      const body = await (await GET(makeRequest())).json() as {
        data: { models: Record<string, { env: string | null; resolved: string; fellBack: boolean }> }
      };

      expect(body.data.models.generation.env).toBe('claude-opus-9-nonexistent');
      expect(body.data.models.generation.fellBack).toBe(true);
      expect(body.data.models.generation.resolved).toBe('claude-opus-5');
    });

    it('env 미설정이면 env=null이고 폴백이 아니다 — 기본값 사용은 정상이다', async () => {
      delete process.env.AI_MODEL_GENERATION;

      const { GET } = await import('@/app/api/v1/admin/debug/route');
      const body = await (await GET(makeRequest())).json() as {
        data: { models: Record<string, { env: string | null; resolved: string; fellBack: boolean }> }
      };

      expect(body.data.models.generation.env).toBeNull();
      expect(body.data.models.generation.fellBack).toBe(false);
      expect(body.data.models.generation.resolved).toBe('claude-opus-5');
    });
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
    expect(body.data.modules['better-sqlite3']).toBe('ok');
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
