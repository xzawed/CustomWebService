import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/repositories/factory', () => ({
  createUserRepository: vi.fn(),
}));

describe('GET /api/v1/auth/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401을 반환한다', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { GET } = await import('@/app/api/v1/auth/status/route');
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  it('인증된 사용자 — verified: true 반환', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'u1', email: 'a@b.com', name: null, avatarUrl: null });

    const { createUserRepository } = await import('@/repositories/factory');
    vi.mocked(createUserRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue({ emailVerified: '2026-01-01T00:00:00Z' }),
    } as never);

    const { GET } = await import('@/app/api/v1/auth/status/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.verified).toBe(true);
  });

  it('미인증 사용자 — verified: false 반환', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'u1', email: 'a@b.com', name: null, avatarUrl: null });

    const { createUserRepository } = await import('@/repositories/factory');
    vi.mocked(createUserRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue({ emailVerified: null }),
    } as never);

    const { GET } = await import('@/app/api/v1/auth/status/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.verified).toBe(false);
  });

  it('DB 사용자 미존재 시 verified: false 반환', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'u1', email: 'a@b.com', name: null, avatarUrl: null });

    const { createUserRepository } = await import('@/repositories/factory');
    vi.mocked(createUserRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(null),
    } as never);

    const { GET } = await import('@/app/api/v1/auth/status/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.verified).toBe(false);
  });
});
