import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { getCorrelationId, CORRELATION_ID_HEADER } from '@/lib/utils/correlationId';
// NOTE: Do NOT import getAuthProvider() from @/lib/config/providers here.
// providers.ts → failover.ts → pg → Node.js 'crypto' — incompatible with Edge runtime.
// Read AUTH_PROVIDER directly from env in the middleware.

const PROTECTED_ROUTES = ['/builder', '/dashboard', '/preview'];

/**
 * Auth.js(JWT) 모드(local/authjs)의 보호 경로 게이팅.
 * 보호 경로가 아니거나 인증된 경우 null, 미인증이면 /login 리다이렉트 응답을 반환한다.
 *
 * 세션은 동적 import로 지연 로드한다 — Node 전용 그래프(authjs: pg/Drizzle)가 정적 Edge 번들로
 * 유입되지 않도록. `local`은 edge-safe 설정(node:crypto 미의존, local-auth-edge.ts)을 사용한다.
 */
async function enforceAuthGate(
  request: NextRequest,
  authProvider: 'authjs' | 'local',
): Promise<NextResponse | null> {
  const authPath = request.nextUrl.pathname;
  if (!PROTECTED_ROUTES.some((route) => authPath.startsWith(route))) return null;

  let authed: boolean;
  if (authProvider === 'local') {
    const { auth } = await import('@/lib/auth/local-auth-edge');
    const session = await auth();
    authed = Boolean(session?.user);
  } else {
    const { getAuthJsUser } = await import('@/lib/auth/authjs-auth');
    authed = Boolean(await getAuthJsUser());
  }
  if (authed) return null;

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('redirect', authPath);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const correlationId = getCorrelationId(request);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

  // 서브도메인 감지 — NEXT_PUBLIC_ROOT_DOMAIN이 설정된 경우에만 동작
  if (rootDomain) {
    const host = request.headers.get('host') ?? '';
    // localhost는 서브도메인 감지 비활성화 (직접 /site/[slug] 접근으로 테스트)
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

    if (!isLocalhost && host.endsWith(`.${rootDomain}`)) {
      const slug = host.slice(0, -(rootDomain.length + 1));
      if (slug && slug !== 'www') {
        const url = request.nextUrl.clone();
        url.pathname = `/site/${slug}${url.pathname === '/' ? '' : url.pathname}`;
        // 서브도메인 사이트는 인증 세션 업데이트 불필요 — 직접 rewrite
        const rewriteResponse = NextResponse.rewrite(url);
        rewriteResponse.headers.set(CORRELATION_ID_HEADER, correlationId);
        rewriteResponse.headers.set('X-Frame-Options', 'DENY');
        rewriteResponse.headers.set('X-Content-Type-Options', 'nosniff');
        rewriteResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        return rewriteResponse;
      }
    }
  }

  let response: NextResponse;

  const authProvider = process.env.AUTH_PROVIDER ?? 'supabase';
  if (authProvider === 'authjs' || authProvider === 'local') {
    // Auth.js (JWT) manages sessions via its own route handlers (/api/auth/*)
    // No session refresh needed in middleware.
    response = NextResponse.next({ request });
    const redirect = await enforceAuthGate(request, authProvider);
    if (redirect) return redirect;
  } else {
    response = await updateSession(request);
  }

  response.headers.set(CORRELATION_ID_HEADER, correlationId);

  const path = request.nextUrl.pathname;
  const isApi = path.startsWith('/api/');
  const isSitePage = path.startsWith('/site/');
  const isPreviewApi = path.startsWith('/api/v1/preview');

  // Security headers
  response.headers.set('X-Frame-Options', isPreviewApi ? 'SAMEORIGIN' : 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // HSTS — production only (Railway serves over HTTPS)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }

  // CSP — skip for API routes and /site/* pages (they set their own CSP headers).
  // /site/* pages serve AI-generated HTML that depends on external CDN resources
  // (Tailwind, Chart.js, Font Awesome etc.) — the route handler applies a permissive
  // CSP specifically for those domains. Adding a second, restrictive CSP here would
  // cause the browser to enforce both, blocking the CDNs.
  if (!isApi && !isSitePage) {
    // Per-request nonce for script-src — eliminates 'unsafe-inline' for inline scripts.
    // btoa(uuid-hex) produces a base64-safe string without padding issues.
    const nonce = btoa(crypto.randomUUID().replaceAll('-', ''));
    response.headers.set('x-nonce', nonce);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const supabaseWs = supabaseUrl.replace(/^https?:\/\//, 'wss://');
    const csp = [
      "default-src 'self'",
      // 'unsafe-eval' is required by Next.js hydration (chunk loading).
      // 'unsafe-inline' is removed — inline scripts must carry the per-request nonce instead.
      `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      `img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com https://avatars.githubusercontent.com`,
      `connect-src 'self' ${supabaseUrl} ${supabaseWs}`,
      "frame-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|images|fonts|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
