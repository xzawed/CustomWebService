import { describe, it, expect, vi, beforeEach } from 'vitest';

// authjs-config는 모듈 로드 시 getDb()(pg/drizzle)를 호출하므로 반드시 mock한다.
// getAuthJsUser는 이 모듈을 동적 import하므로 mock이 그 경로를 가로챈다.
vi.mock('@/lib/auth/authjs-config', () => ({
  auth: vi.fn(),
}));

async function setAuthSession(session: unknown) {
  const { auth } = await import('@/lib/auth/authjs-config');
  vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue(session);
}

describe('getAuthJsUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('유효한 세션이면 AuthUser로 매핑한다', async () => {
    await setAuthSession({
      user: { id: 'u-1', email: 'a@b.com', name: '홍길동', image: 'https://img/x.png' },
    });

    const { getAuthJsUser } = await import('@/lib/auth/authjs-auth');
    const user = await getAuthJsUser();

    expect(user).toEqual({
      id: 'u-1',
      email: 'a@b.com',
      name: '홍길동',
      avatarUrl: 'https://img/x.png',
    });
  });

  it('name/image가 없으면 null로 매핑한다', async () => {
    await setAuthSession({ user: { id: 'u-2', email: 'c@d.com' } });

    const { getAuthJsUser } = await import('@/lib/auth/authjs-auth');
    const user = await getAuthJsUser();

    expect(user).toMatchObject({ id: 'u-2', email: 'c@d.com', name: null, avatarUrl: null });
  });

  it('세션이 null이면 null을 반환한다', async () => {
    await setAuthSession(null);

    const { getAuthJsUser } = await import('@/lib/auth/authjs-auth');
    expect(await getAuthJsUser()).toBeNull();
  });

  it('user.id가 없으면 null을 반환한다', async () => {
    await setAuthSession({ user: { email: 'e@f.com' } });

    const { getAuthJsUser } = await import('@/lib/auth/authjs-auth');
    expect(await getAuthJsUser()).toBeNull();
  });

  it('email이 없으면 null을 반환한다', async () => {
    await setAuthSession({ user: { id: 'u-3' } });

    const { getAuthJsUser } = await import('@/lib/auth/authjs-auth');
    expect(await getAuthJsUser()).toBeNull();
  });
});
