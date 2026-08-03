/**
 * GET/POST /api/v1/admin/feature-flags — 관리자 킬스위치 조회·토글.
 *
 * 알려진 플래그만 허용(zod enum). 오타 플래그가 조용히 무시되면
 * "스위치를 내렸다"는 착각만 남기므로 반드시 거부해야 한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listFeatureFlags = vi.fn();
const setFeatureFlag = vi.fn();
const eventBusEmit = vi.fn();

vi.mock('@/lib/config/featureFlags', () => ({
  FEATURE_FLAGS: ['enable_generation', 'enable_signup'] as const,
  listFeatureFlags: (...args: unknown[]) => listFeatureFlags(...args) as ReturnType<typeof listFeatureFlags>,
  setFeatureFlag: (...args: unknown[]) => setFeatureFlag(...args) as ReturnType<typeof setFeatureFlag>,
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: (...args: unknown[]) => eventBusEmit(...args) },
}));

const VALID_ADMIN_KEY = 'test-admin-secret-key';

function makeAdminRequest(
  method: 'GET' | 'POST',
  key: string | null = VALID_ADMIN_KEY,
  body?: unknown,
): Request {
  const headers: Record<string, string> = {
    'x-forwarded-for': '10.0.0.50',
  };
  if (key !== null) headers['Authorization'] = `Bearer ${key}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request('http://localhost/api/v1/admin/feature-flags', {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** 잘못된 JSON 본문(파싱 실패) 요청 */
function makeMalformedJsonRequest(key: string = VALID_ADMIN_KEY): Request {
  return new Request('http://localhost/api/v1/admin/feature-flags', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'x-forwarded-for': '10.0.0.51',
    },
    body: '{not-json',
  });
}

describe('GET/POST /api/v1/admin/feature-flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
    listFeatureFlags.mockReturnValue([
      { name: 'enable_generation', enabled: true },
      { name: 'enable_signup', enabled: true },
    ]);
    setFeatureFlag.mockImplementation(() => undefined);
  });

  describe('인증', () => {
    it('Authorization 헤더 없음 → 403', async () => {
      const { GET } = await import('@/app/api/v1/admin/feature-flags/route');
      const res = await GET(makeAdminRequest('GET', null));
      expect(res.status).toBe(403);
    });

    it('잘못된 관리자 키 → 403', async () => {
      const { GET } = await import('@/app/api/v1/admin/feature-flags/route');
      const res = await GET(makeAdminRequest('GET', 'wrong-key'));
      expect(res.status).toBe(403);
    });

    it('POST에서도 잘못된 키 → 403', async () => {
      const { POST } = await import('@/app/api/v1/admin/feature-flags/route');
      const res = await POST(
        makeAdminRequest('POST', 'wrong-key', { flag: 'enable_generation', enabled: false }),
      );
      expect(res.status).toBe(403);
      expect(setFeatureFlag).not.toHaveBeenCalled();
    });
  });

  describe('GET', () => {
    it('알려진 플래그 목록과 현재 상태를 반환한다', async () => {
      const { GET } = await import('@/app/api/v1/admin/feature-flags/route');
      const res = await GET(makeAdminRequest('GET'));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        success: boolean;
        data: { known: string[]; flags: { name: string; enabled: boolean }[] };
      };
      expect(body.success).toBe(true);
      expect(body.data.known).toEqual(['enable_generation', 'enable_signup']);
      expect(body.data.flags).toEqual([
        { name: 'enable_generation', enabled: true },
        { name: 'enable_signup', enabled: true },
      ]);
      expect(listFeatureFlags).toHaveBeenCalledOnce();
    });
  });

  describe('POST', () => {
    it('유효한 body로 플래그를 설정하고 성공을 반환한다', async () => {
      const { POST } = await import('@/app/api/v1/admin/feature-flags/route');
      const res = await POST(
        makeAdminRequest('POST', VALID_ADMIN_KEY, {
          flag: 'enable_generation',
          enabled: false,
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        success: boolean;
        data: { flag: string; enabled: boolean };
      };
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ flag: 'enable_generation', enabled: false });
      expect(setFeatureFlag).toHaveBeenCalledWith('enable_generation', false);
      expect(eventBusEmit).toHaveBeenCalledWith({
        type: 'FEATURE_FLAG_CHANGED',
        payload: { flag: 'enable_generation', enabled: false },
      });
    });

    it('알 수 없는 플래그 이름은 zod enum으로 거부한다', async () => {
      const { POST } = await import('@/app/api/v1/admin/feature-flags/route');
      const res = await POST(
        makeAdminRequest('POST', VALID_ADMIN_KEY, {
          flag: 'enable_typo_flag',
          enabled: false,
        }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        success: boolean;
        error: { code: string };
      };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(setFeatureFlag).not.toHaveBeenCalled();
    });

    it('enabled가 boolean이 아니면 거부한다', async () => {
      const { POST } = await import('@/app/api/v1/admin/feature-flags/route');
      const res = await POST(
        makeAdminRequest('POST', VALID_ADMIN_KEY, {
          flag: 'enable_generation',
          enabled: 'false',
        }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        success: boolean;
        error: { code: string };
      };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(setFeatureFlag).not.toHaveBeenCalled();
    });

    it('잘못된 JSON 본문은 검증 오류(400)이지 500이 아니다', async () => {
      const { POST } = await import('@/app/api/v1/admin/feature-flags/route');
      const res = await POST(makeMalformedJsonRequest());
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        success: boolean;
        error: { code: string };
      };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(setFeatureFlag).not.toHaveBeenCalled();
    });
  });
});
