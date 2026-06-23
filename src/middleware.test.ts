import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * 미들웨어 — local-only 세션 게이팅 검증.
 *
 * edge-safe 세션 모듈(local-auth-edge)을 mock해 분기 로직만 단위 검증한다(실 Auth.js JWT 검증은
 * 실서버에서 동작 — 서빙 검증 대상).
 */
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock('@/lib/auth/local-auth-edge', () => ({ auth: mocks.auth }));

import { middleware } from '@/middleware';

function req(path: string): NextRequest {
  return new NextRequest(new URL(`http://localhost${path}`));
}

describe('middleware — local-only 인증 게이트', () => {
  const ORIG = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN; // 서브도메인 라우팅 비활성
  });

  afterEach(() => {
    process.env = { ...ORIG };
  });

  it('보호 경로 + 세션 없음 → /login으로 리다이렉트(redirect 파라미터 보존)', async () => {
    mocks.auth.mockResolvedValue(null);

    const res = await middleware(req('/dashboard'));

    expect(res.status).toBe(307);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('/login');
    expect(loc).toContain('redirect=%2Fdashboard');
  });

  it('보호 경로 + 세션 있음 → 통과(보안 헤더 포함, 리다이렉트 아님)', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1', email: 'a@b.com' } });

    const res = await middleware(req('/builder'));

    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('비보호 경로(/)는 세션 검증 없이 통과한다', async () => {
    const res = await middleware(req('/'));

    expect(mocks.auth).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
  });

  it('비-API·비-site 경로는 CSP 헤더를 설정한다(connect-src는 self 전용)', async () => {
    const res = await middleware(req('/'));

    const csp = res.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('supabase');
  });

  it('서브도메인 호스트는 /site/[slug]로 rewrite한다', async () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'xzawed.xyz';

    const request = new NextRequest(new URL('http://myslug.xzawed.xyz/'), {
      headers: { host: 'myslug.xzawed.xyz' },
    });
    const res = await middleware(request);

    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/myslug');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });
});
