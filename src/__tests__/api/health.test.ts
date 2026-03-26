import { describe, it, expect, vi, beforeEach } from 'vitest';

// Supabase 서버 클라이언트 mock
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

describe('GET /api/v1/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DB 연결 정상 시 healthy 상태를 반환한다', async () => {
    const { createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createServiceClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ error: null }),
      }),
    } as never);

    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET();
    const body = await response.json();

    expect(body.status).toBe('healthy');
    expect(body.checks.database).toBe('ok');
    expect(body.checks.services).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('DB 연결 실패 시 unhealthy 상태를 반환한다', async () => {
    const { createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createServiceClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ error: new Error('connection failed') }),
      }),
    } as never);

    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET();
    const body = await response.json();

    expect(body.status).toBe('unhealthy');
    expect(body.checks.database).toBe('error');
  });

  it('DB 예외 발생 시 degraded 또는 unhealthy 상태를 반환한다', async () => {
    const { createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createServiceClient).mockRejectedValue(new Error('cannot connect'));

    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET();
    const body = await response.json();

    expect(['degraded', 'unhealthy']).toContain(body.status);
  });
});
