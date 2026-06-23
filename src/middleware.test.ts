import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 미들웨어 — AUTH_PROVIDER=local 세션 게이팅 분기 검증.
 *
 * edge-safe 세션 모듈(local-auth-edge)을 mock해 분기 로직만 단위 검증한다(실 Auth.js JWT 검증은
 * 실서버에서 동작 — Phase 4 서빙 검증 대상). supabase updateSession은 호출되지 않아야 한다.
 */
const mocks = vi.hoisted(() => ({ auth: vi.fn(), updateSession: vi.fn() }));

vi.mock('@/lib/auth/local-auth-edge', () => ({ auth: mocks.auth }));
vi.mock('@/lib/supabase/middleware', () => ({ updateSession: mocks.updateSession }));

import { middleware } from '@/middleware';

function req(path: string): NextRequest {
  return new NextRequest(new URL(`http://localhost${path}`));
}

describe('middleware — AUTH_PROVIDER=local', () => {
  const ORIG = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateSession.mockReturnValue(NextResponse.next());
    process.env.AUTH_PROVIDER = 'local';
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
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('보호 경로 + 세션 있음 → 통과(보안 헤더 포함, 리다이렉트 아님)', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1', email: 'a@b.com' } });

    const res = await middleware(req('/builder'));

    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('비보호 경로(/)는 세션 검증 없이 통과한다', async () => {
    const res = await middleware(req('/'));

    expect(mocks.auth).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it('supabase 모드는 local-auth-edge 대신 updateSession을 사용한다', async () => {
    process.env.AUTH_PROVIDER = 'supabase';

    await middleware(req('/dashboard'));

    expect(mocks.updateSession).toHaveBeenCalledTimes(1);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
