import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '@/lib/auth/password';
import { __resetAuthRateLimit } from '@/lib/auth/rateLimit';

const cascadeDeleteUser = vi.fn();
const eventBusEmit = vi.fn();
const findById = vi.fn();

vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/lib/auth/deleteAccountCascade', () => ({
  cascadeDeleteUser: (...args: unknown[]) => cascadeDeleteUser(...args),
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: (...args: unknown[]) => eventBusEmit(...args), on: vi.fn() },
}));

vi.mock('@/lib/db/sqlite/connection', () => ({
  getSqliteDb: vi.fn(() => ({ _mockDb: true })),
}));

vi.mock('@/repositories/factory', () => ({
  createUserRepository: () => ({ findById }),
}));

import { getAuthUser } from '@/lib/auth/index';

const AUTH = {
  id: 'user-1',
  email: 'owner@example.com',
  name: 'Owner',
  avatarUrl: null as string | null,
};

function deleteReq(body: unknown, ip = '203.0.113.50'): Request {
  return new Request('https://app.example/api/v1/auth/account', {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

describe('DELETE /api/v1/auth/account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetAuthRateLimit();
  });

  it('비로그인 시 401', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/v1/auth/account/route');
    const res = await DELETE(deleteReq({ password: 'x' }));
    expect(res.status).toBe(401);
    expect(cascadeDeleteUser).not.toHaveBeenCalled();
  });

  it('잘못된 비밀번호는 401이고 cascade를 호출하지 않는다', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(AUTH);
    findById.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
      passwordHash: hashPassword('correct-password-ok'),
      preferences: {},
      avatarUrl: null,
      emailVerified: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const { DELETE } = await import('@/app/api/v1/auth/account/route');
    const res = await DELETE(deleteReq({ password: 'wrong-password' }));
    expect(res.status).toBe(401);
    expect(cascadeDeleteUser).not.toHaveBeenCalled();
    expect(eventBusEmit).not.toHaveBeenCalled();
  });

  it('비밀번호 누락은 400/검증 실패이고 cascade 없음', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(AUTH);
    findById.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      name: null,
      passwordHash: hashPassword('pw'),
      preferences: {},
      avatarUrl: null,
      emailVerified: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const { DELETE } = await import('@/app/api/v1/auth/account/route');
    const res = await DELETE(deleteReq({}));
    expect(res.status).toBe(400);
    expect(cascadeDeleteUser).not.toHaveBeenCalled();
  });

  it('성공 시 cascade·USER_DELETED(deletedUserId)·세션 쿠키 만료', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(AUTH);
    const password = 'correct-password-ok';
    findById.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
      passwordHash: hashPassword(password),
      preferences: {},
      avatarUrl: null,
      emailVerified: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const { DELETE } = await import('@/app/api/v1/auth/account/route');
    const res = await DELETE(deleteReq({ password }));
    expect(res.status).toBe(200);

    expect(cascadeDeleteUser).toHaveBeenCalledWith(
      { _mockDb: true },
      {
        userId: 'user-1',
        email: 'owner@example.com',
        name: 'Owner',
      },
    );

    expect(eventBusEmit).toHaveBeenCalledWith({
      type: 'USER_DELETED',
      payload: { deletedUserId: 'user-1' },
    });
    // payload 키 이름 고정 — userId 금지
    const emitted = eventBusEmit.mock.calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(emitted.payload).toHaveProperty('deletedUserId');
    expect(emitted.payload).not.toHaveProperty('userId');

    const setCookies = res.headers.getSetCookie?.() ?? [];
    // undici/node may expose getSetCookie; fallback to raw header
    const cookieHeader =
      setCookies.length > 0
        ? setCookies.join('\n')
        : (res.headers.get('set-cookie') ?? '');
    expect(cookieHeader).toMatch(/authjs\.session-token/);
    expect(cookieHeader).toMatch(/Max-Age=0/);

    const body = await res.json();
    expect(body).toEqual({ success: true, data: { deleted: true } });
  });
});
