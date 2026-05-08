import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const exchangeCodeForSessionMock = vi.fn();
const getUserMock = vi.fn();
const getAllMock = vi.fn();
const setMock = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: getAllMock,
    set: setMock,
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock,
      getUser: getUserMock,
    },
  })),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('@/lib/events/eventPersister', () => ({
  registerEventPersister: vi.fn(),
}));

describe('OAuth callback route', () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.NEXT_PUBLIC_APP_URL = 'https://xzawed.xyz';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          user_metadata: {},
        },
      },
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
  });

  it('성공 시 NEXT_PUBLIC_APP_URL이 아닌 callback 요청 origin으로 redirect한다', async () => {
    const { GET } = await import('./route');

    const response = await GET(
      new Request('https://customwebservice-production.up.railway.app/callback?code=abc'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://customwebservice-production.up.railway.app/dashboard',
    );
  });

  it('next 파라미터가 안전한 보호 경로면 해당 경로로 redirect한다', async () => {
    const { GET } = await import('./route');

    const response = await GET(new Request('https://xzawed.xyz/callback?code=abc&next=/builder'));

    expect(response.headers.get('location')).toBe('https://xzawed.xyz/builder');
  });

  it('외부 next 파라미터는 dashboard로 대체한다', async () => {
    const { GET } = await import('./route');

    const response = await GET(
      new Request('https://xzawed.xyz/callback?code=abc&next=https://evil.example'),
    );

    expect(response.headers.get('location')).toBe('https://xzawed.xyz/dashboard');
  });

  it('코드 교환 실패 시 같은 origin의 login으로 redirect한다', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: new Error('bad code') });
    const { GET } = await import('./route');

    const response = await GET(new Request('https://customwebservice-production.up.railway.app/callback?code=bad'));

    expect(response.headers.get('location')).toBe(
      'https://customwebservice-production.up.railway.app/login',
    );
  });
});
