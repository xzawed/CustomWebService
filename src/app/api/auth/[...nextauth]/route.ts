import { type NextRequest } from 'next/server';

// Auth.js v5 catch-all 라우트 — AUTH_PROVIDER에 따라 핸들러를 선택한다.
// 이 라우트는 Node 런타임(기본)에서 실행되므로 node:crypto 의존(local-auth-config)이 안전하다.
//
// - local  → Credentials 단일 관리자(local-auth-config)
// - authjs → OAuth + DrizzleAdapter(authjs-config)
// - supabase/미설정 → 404 (Supabase Auth가 /callback에서 OAuth를 처리, NextAuth 미사용)
//
// 동적 import로 활성 provider의 config만 로드한다(supabase 모드는 NextAuth를 초기화하지 않음).

type AuthRouteHandlers = {
  GET: (req: Request) => Promise<Response>;
  POST: (req: Request) => Promise<Response>;
};

async function resolveHandlers(): Promise<AuthRouteHandlers | null> {
  const provider = process.env.AUTH_PROVIDER;
  if (provider === 'local') {
    return (await import('@/lib/auth/local-auth-config')).handlers as AuthRouteHandlers;
  }
  if (provider === 'authjs') {
    return (await import('@/lib/auth/authjs-config')).handlers as AuthRouteHandlers;
  }
  return null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const handlers = await resolveHandlers();
  if (!handlers) return new Response('Not Found', { status: 404 });
  return handlers.GET(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  const handlers = await resolveHandlers();
  if (!handlers) return new Response('Not Found', { status: 404 });
  return handlers.POST(req);
}
