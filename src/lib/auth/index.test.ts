import { beforeEach, describe, expect, it, vi } from 'vitest';

const findById = vi.fn();
const getLocalAuthUser = vi.fn();
const loggerError = vi.fn();

vi.mock('@/repositories/factory', () => ({
  createUserRepository: () => ({ findById }),
}));

vi.mock('@/lib/auth/local-auth', () => ({
  getLocalAuthUser: (...args: unknown[]) => getLocalAuthUser(...args),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: (...args: unknown[]) => loggerError(...args), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { getAuthUser } from './index';

describe('getAuthUser', () => {
  beforeEach(() => {
    findById.mockReset();
    getLocalAuthUser.mockReset();
    loggerError.mockReset();
  });

  it('세션이 없으면 null', async () => {
    getLocalAuthUser.mockResolvedValue(null);
    await expect(getAuthUser()).resolves.toBeNull();
    expect(findById).not.toHaveBeenCalled();
  });

  it('세션 id에 대응하는 DB 행이 없으면 null (삭제·유령 JWT)', async () => {
    getLocalAuthUser.mockResolvedValue({
      id: 'gone-user',
      email: 'ghost@example.com',
      name: 'Ghost',
      avatarUrl: null,
    });
    findById.mockResolvedValue(null);

    await expect(getAuthUser()).resolves.toBeNull();
    expect(findById).toHaveBeenCalledWith('gone-user');
  });

  it('DB 행이 있으면 세션이 아니라 DB 필드로 AuthUser를 반환한다', async () => {
    getLocalAuthUser.mockResolvedValue({
      id: 'u1',
      email: 'stale@example.com',
      name: 'Stale JWT Name',
      avatarUrl: 'https://jwt.example/old.png',
    });
    findById.mockResolvedValue({
      id: 'u1',
      email: 'current@example.com',
      name: 'DB Name',
      avatarUrl: 'https://db.example/avatar.png',
      preferences: {},
      passwordHash: 'hash',
      emailVerified: '2026-06-24T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    await expect(getAuthUser()).resolves.toEqual({
      id: 'u1',
      email: 'current@example.com',
      name: 'DB Name',
      avatarUrl: 'https://db.example/avatar.png',
    });
  });

  it('DB 조회가 throw하면 fail-closed로 null을 반환하고 에러를 로깅한다', async () => {
    getLocalAuthUser.mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      name: null,
      avatarUrl: null,
    });
    findById.mockRejectedValue(new Error('sqlite boom'));

    await expect(getAuthUser()).resolves.toBeNull();
    expect(loggerError).toHaveBeenCalledWith(
      'getAuthUser: user lookup failed — treating as unauthenticated',
      expect.objectContaining({
        userId: 'u1',
        error: 'sqlite boom',
      }),
    );
  });
});
