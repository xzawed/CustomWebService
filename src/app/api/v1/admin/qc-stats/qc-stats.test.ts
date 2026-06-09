import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockImplementation(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => Promise.resolve({ count: 0, data: [] }),
        }),
      }),
    }),
  })),
}));

vi.mock('@/repositories/codeRepository', () => ({
  CodeRepository: vi.fn(function (this: { findMetadataByDateRange: ReturnType<typeof vi.fn> }) {
    this.findMetadataByDateRange = vi.fn().mockResolvedValue([]);
  }),
}));

vi.mock('@/lib/utils/adminAuth', () => ({
  adminCorsHeaders: {},
  verifyAdminKey: vi.fn(),
  withAdminCors: vi.fn().mockImplementation((res: Response) => res),
}));

import { GET } from './route';

function makeRequest(search = '') {
  return new Request(`http://localhost/api/v1/admin/qc-stats${search}`);
}

describe('GET /api/v1/admin/qc-stats', () => {
  it('days 파라미터 미설정 시 정상 응답한다', async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
  });

  it('days=abc (NaN) 시 기본값 7일을 사용하여 정상 응답한다', async () => {
    const response = await GET(makeRequest('?days=abc'));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.period.days).toBe(7);
  });

  it('days=-5 (음수) 시 기본값 7일을 사용하여 정상 응답한다', async () => {
    const response = await GET(makeRequest('?days=-5'));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.period.days).toBe(7);
  });

  it('days=0 시 기본값 7일을 사용한다', async () => {
    const response = await GET(makeRequest('?days=0'));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.period.days).toBe(7);
  });

  it('days=14 (유효값) 시 해당 기간을 사용한다', async () => {
    const response = await GET(makeRequest('?days=14'));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.period.days).toBe(14);
  });

  it('Supabase 쿼리 에러 시 0 메트릭으로 은폐하지 않고 500을 반환한다', async () => {
    const { createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createServiceClient).mockResolvedValueOnce({
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () =>
              Promise.resolve({ count: null, data: null, error: { code: 'XX000', message: 'db down' } }),
          }),
        }),
      }),
    } as never);

    const response = await GET(makeRequest());
    expect(response.status).toBe(500);
  });
});
