import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * /api/auth/[...nextauth] 라우트 — AUTH_PROVIDER에 따른 핸들러 디스패치 검증.
 *
 * 전체/edge config는 module-load 시 NextAuth를 초기화하므로 mock한다. supabase 모드에서는
 * 어떤 NextAuth config도 동적 import 되지 않아야 한다(404).
 */
const localHandlers = { GET: vi.fn(), POST: vi.fn() };
const authjsHandlers = { GET: vi.fn(), POST: vi.fn() };

vi.mock('@/lib/auth/local-auth-config', () => ({ handlers: localHandlers }));
vi.mock('@/lib/auth/authjs-config', () => ({ handlers: authjsHandlers }));

describe('/api/auth/[...nextauth] dispatch', () => {
  const ORIG = process.env.AUTH_PROVIDER;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (ORIG === undefined) delete process.env.AUTH_PROVIDER;
    else process.env.AUTH_PROVIDER = ORIG;
  });

  it('supabase/미설정 모드는 404를 반환하고 NextAuth를 로드하지 않는다', async () => {
    delete process.env.AUTH_PROVIDER;
    const { GET } = await import('@/app/api/auth/[...nextauth]/route');
    const res = await GET(new Request('http://localhost/api/auth/session') as never);
    expect(res.status).toBe(404);
    expect(localHandlers.GET).not.toHaveBeenCalled();
    expect(authjsHandlers.GET).not.toHaveBeenCalled();
  });

  it('local 모드 GET은 local-auth-config 핸들러로 위임한다', async () => {
    process.env.AUTH_PROVIDER = 'local';
    const sentinel = new Response('ok');
    localHandlers.GET.mockResolvedValue(sentinel);

    const { GET } = await import('@/app/api/auth/[...nextauth]/route');
    const req = new Request('http://localhost/api/auth/session');
    const res = await GET(req as never);

    expect(localHandlers.GET).toHaveBeenCalledWith(req);
    expect(res).toBe(sentinel);
  });

  it('local 모드 POST(로그인)도 위임한다', async () => {
    process.env.AUTH_PROVIDER = 'local';
    const sentinel = new Response('ok');
    localHandlers.POST.mockResolvedValue(sentinel);

    const { POST } = await import('@/app/api/auth/[...nextauth]/route');
    const req = new Request('http://localhost/api/auth/callback/credentials', { method: 'POST' });

    expect(await POST(req as never)).toBe(sentinel);
    expect(localHandlers.POST).toHaveBeenCalledWith(req);
  });

  it('authjs 모드는 authjs-config 핸들러로 위임한다', async () => {
    process.env.AUTH_PROVIDER = 'authjs';
    const sentinel = new Response('ok');
    authjsHandlers.GET.mockResolvedValue(sentinel);

    const { GET } = await import('@/app/api/auth/[...nextauth]/route');
    expect(await GET(new Request('http://localhost/api/auth/session') as never)).toBe(sentinel);
    expect(authjsHandlers.GET).toHaveBeenCalled();
    expect(localHandlers.GET).not.toHaveBeenCalled();
  });
});
