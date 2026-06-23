import { type NextRequest } from 'next/server';

// Auth.js v5 catch-all 라우트 — Credentials 단일 관리자(local-auth-config) 핸들러.
// Node 런타임(기본)에서 실행되므로 node:crypto 의존(scrypt)이 안전하다.
// 동적 import로 Node 전용 그래프가 Edge 번들로 유입되지 않게 한다.

async function resolveHandlers(): Promise<{
  GET: (req: Request) => Promise<Response>;
  POST: (req: Request) => Promise<Response>;
}> {
  return (await import('@/lib/auth/local-auth-config')).handlers as {
    GET: (req: Request) => Promise<Response>;
    POST: (req: Request) => Promise<Response>;
  };
}

export async function GET(req: NextRequest): Promise<Response> {
  const handlers = await resolveHandlers();
  return handlers.GET(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  const handlers = await resolveHandlers();
  return handlers.POST(req);
}
