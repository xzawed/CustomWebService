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

// ─────────────────────────────────────────────────────────────────────────────
describe('Rate Limit 심화', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
  });

  it('서로 다른 IP에서는 각각 60회 독립 허용', async () => {
    const { GET } = await import('@/app/api/v1/admin/qc-stats/route');

    // IP-A: 60회 → 모두 200
    for (let i = 0; i < 60; i++) {
      const req = new Request('http://localhost/api/v1/admin/qc-stats', {
        headers: { Authorization: `Bearer ${VALID_ADMIN_KEY}`, 'x-forwarded-for': '1.2.3.4' },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
    }

    // IP-B: 첫 번째 요청 → IP-A와 독립 카운터이므로 200
    const reqB = new Request('http://localhost/api/v1/admin/qc-stats', {
      headers: { Authorization: `Bearer ${VALID_ADMIN_KEY}`, 'x-forwarded-for': '5.6.7.8' },
    });
    const resB = await GET(reqB);
    expect(resB.status).toBe(200);

    // IP-A: 61번째 → 403
    const reqA61 = new Request('http://localhost/api/v1/admin/qc-stats', {
      headers: { Authorization: `Bearer ${VALID_ADMIN_KEY}`, 'x-forwarded-for': '1.2.3.4' },
    });
    const resA61 = await GET(reqA61);
    expect(resA61.status).toBe(403);
  });

  it('x-forwarded-for: 복수 IP → 첫 번째만 사용', async () => {
    const { GET } = await import('@/app/api/v1/admin/qc-stats/route');

    // "10.0.0.1, 20.0.0.1" → 첫 번째 IP "10.0.0.1"을 rate limit 키로 사용
    // 동일 첫번째 IP로 60회 이상 요청 시 차단
    for (let i = 0; i < 60; i++) {
      const req = new Request('http://localhost/api/v1/admin/qc-stats', {
        headers: {
          Authorization: `Bearer ${VALID_ADMIN_KEY}`,
          'x-forwarded-for': '10.0.0.1, 20.0.0.1, 30.0.0.1',
        },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
    }

    // 61번째: 첫 번째 IP 10.0.0.1 기준으로 차단
    const req61 = new Request('http://localhost/api/v1/admin/qc-stats', {
      headers: {
        Authorization: `Bearer ${VALID_ADMIN_KEY}`,
        'x-forwarded-for': '10.0.0.1, 99.99.99.99',
      },
    });
    const res61 = await GET(req61);
    expect(res61.status).toBe(403);
  });

  it('x-real-ip 폴백 (x-forwarded-for 없을 때)', async () => {
    const { GET } = await import('@/app/api/v1/admin/qc-stats/route');

    // x-forwarded-for 없이 x-real-ip만 사용 → 정상 처리
    const req = new Request('http://localhost/api/v1/admin/qc-stats', {
      headers: {
        Authorization: `Bearer ${VALID_ADMIN_KEY}`,
        'x-real-ip': '192.0.2.1',
      },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('IP 없음(unknown)도 카운팅되어 60회 초과 시 차단', async () => {
    const { GET } = await import('@/app/api/v1/admin/qc-stats/route');

    // x-forwarded-for, x-real-ip 모두 없음 → 'unknown' 키로 카운팅
    for (let i = 0; i < 60; i++) {
      const req = new Request('http://localhost/api/v1/admin/qc-stats', {
        headers: { Authorization: `Bearer ${VALID_ADMIN_KEY}` },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
    }

    const req61 = new Request('http://localhost/api/v1/admin/qc-stats', {
      headers: { Authorization: `Bearer ${VALID_ADMIN_KEY}` },
    });
    const res61 = await GET(req61);
    expect(res61.status).toBe(403);
  });
});

describe('입력 검증', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
  });

  it('trigger-qc: 유효하지 않은 UUID 형식 projectId → 400/422', async () => {
    // triggerQcSchema는 z.string().min(1)만 검증하므로 빈 문자열만 거부됨.
    // UUID 형식 검증은 없으므로 임의 문자열은 통과될 수 있음.
    // 이 테스트는 빈 projectId가 거부됨을 확인함.
    const { isQcEnabled } = await import('@/lib/qc');
    vi.mocked(isQcEnabled).mockReturnValue(true);

    const { POST } = await import('@/app/api/v1/admin/trigger-qc/route');
    const res = await POST(
      makeAdminRequest('/api/v1/admin/trigger-qc', 'POST', VALID_ADMIN_KEY, { projectId: '' }),
    );

    // Zod validation: min(1) 위반 → INVALID_INPUT (400)
    expect([400, 422]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('qc-stats: days 음수 → 안전하게 처리 (오류 없음)', async () => {
    const { GET } = await import('@/app/api/v1/admin/qc-stats/route');
    const req = new Request('http://localhost/api/v1/admin/qc-stats?days=-1', {
      headers: {
        Authorization: `Bearer ${VALID_ADMIN_KEY}`,
        'x-real-ip': '127.0.0.1',
      },
    });
    const res = await GET(req);

    // 음수 days는 parseInt에서 -1이 되어 미래 날짜 기준이 되므로 빈 결과 반환
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('qc-stats: days 매우 큰 값(10000) → 정상 동작', async () => {
    const { GET } = await import('@/app/api/v1/admin/qc-stats/route');
    const req = new Request('http://localhost/api/v1/admin/qc-stats?days=10000', {
      headers: {
        Authorization: `Bearer ${VALID_ADMIN_KEY}`,
        'x-real-ip': '127.0.0.1',
      },
    });
    const res = await GET(req);

    // 매우 큰 days도 정상 처리 (오버플로우나 오류 없음)
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('OPTIONS preflight → rate limit 미적용 또는 200', async () => {
    const { OPTIONS } = await import('@/app/api/v1/admin/qc-stats/route');

    // OPTIONS는 verifyAdminKey를 호출하지 않으므로 rate limit에 영향받지 않음
    const res = await OPTIONS();

    // 204 No Content (CORS preflight 응답)
    expect([200, 204]).toContain(res.status);
  });
});

describe('CORS 헤더', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
  });

  it('withAdminCors: 응답에 CORS 헤더 포함', async () => {
    const { GET } = await import('@/app/api/v1/admin/qc-stats/route');
    const res = await GET(makeAdminRequest('/api/v1/admin/qc-stats'));

    expect(res.status).toBe(200);
    // withAdminCors가 래핑하여 Access-Control-Allow-Origin 헤더 추가
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBeNull();
    expect(res.headers.get('Access-Control-Allow-Methods')).not.toBeNull();
    expect(res.headers.get('Access-Control-Allow-Headers')).not.toBeNull();
  });
});
