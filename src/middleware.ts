import { type NextRequest, NextResponse } from 'next/server';
import { getCorrelationId, CORRELATION_ID_HEADER } from '@/lib/utils/correlationId';

const PROTECTED_ROUTES = ['/builder', '/dashboard', '/preview'];

/**
 * 서브도메인에서 `/site/{slug}` rewrite를 건너뛸 경로.
 *
 * 게시 사이트의 생성 JS는 상대경로 `/api/v1/proxy?...`로 API를 호출한다
 * (promptBuilder가 CORS 때문에 직접 외부 URL 호출을 금지하므로 프록시 경유가 유일한 경로).
 * rewrite되면 `/site/{slug}/api/v1/proxy`가 되는데 `/site/[slug]`는 단일 동적 세그먼트라
 * 매칭되지 않아 404가 된다 — API를 쓰는 게시 사이트가 전부 데이터 로딩에 실패했다.
 *
 * `/api/*` 전체가 아니라 프록시 경로만 여는 이유: 세션 쿠키가 `__Host-` 프리픽스라
 * 호스트 전용이므로 생성 사이트가 방문자 세션을 탈취할 수는 없지만, 불필요한
 * 엔드포인트를 서브도메인에 노출할 이유가 없다(최소 노출).
 */
const SUBDOMAIN_PASSTHROUGH_PREFIXES = ['/api/v1/proxy'];

function isSubdomainPassthrough(pathname: string): boolean {
  return SUBDOMAIN_PASSTHROUGH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Auth.js(JWT, local) 보호 경로 게이팅.
 * 보호 경로가 아니거나 인증된 경우 null, 미인증이면 /login 리다이렉트 응답을 반환한다.
 *
 * 세션은 동적 import로 지연 로드한다 — edge-safe 설정(node:crypto 미의존, local-auth-edge.ts)을 사용해
 * Edge 런타임 호환성을 유지한다.
 */
async function enforceAuthGate(request: NextRequest): Promise<NextResponse | null> {
  const authPath = request.nextUrl.pathname;
  if (!PROTECTED_ROUTES.some((route) => authPath.startsWith(route))) return null;

  const { auth } = await import('@/lib/auth/local-auth-edge');
  const session = await auth();
  if (session?.user) return null;

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
      // 패스스루 경로는 rewrite하지 않고 아래 일반 응답 경로로 흘려보낸다 —
      // 그래야 correlation id·보안 헤더가 적용되고 isApi 판정으로 CSP를 건너뛴다.
      if (slug && slug !== 'www' && !isSubdomainPassthrough(request.nextUrl.pathname)) {
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

  // Auth.js(JWT, local)는 자체 라우트 핸들러(/api/auth/*)로 세션을 관리한다 — 미들웨어 세션 갱신 불필요.
  const response = NextResponse.next({ request });
  const redirect = await enforceAuthGate(request);
  if (redirect) return redirect;

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

    const csp = [
      "default-src 'self'",
      // 'unsafe-eval' is required by Next.js hydration (chunk loading).
      // 'unsafe-inline' is removed — inline scripts must carry the per-request nonce instead.
      `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      `img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.githubusercontent.com`,
      `connect-src 'self'`,
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
