import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { getCorrelationId, CORRELATION_ID_HEADER } from '@/lib/utils/correlationId';

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

  const response = await updateSession(request);
  response.headers.set(CORRELATION_ID_HEADER, correlationId);

  const path = request.nextUrl.pathname;
  const isApi = path.startsWith('/api/');
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

  // CSP — skip for API routes (they set their own, or return JSON)
  if (!isApi) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const supabaseWs = supabaseUrl.replace(/^https?:\/\//, 'wss://');
    const csp = [
      "default-src 'self'",
      // Next.js App Router requires unsafe-inline for hydration scripts
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|images|fonts|api/v1/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
