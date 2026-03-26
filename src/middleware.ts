import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
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
        rewriteResponse.headers.set('X-Frame-Options', 'DENY');
        rewriteResponse.headers.set('X-Content-Type-Options', 'nosniff');
        rewriteResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        return rewriteResponse;
      }
    }
  }

  const response = await updateSession(request);

  // Security headers
  const isPreviewApi = request.nextUrl.pathname.startsWith('/api/v1/preview');
  response.headers.set('X-Frame-Options', isPreviewApi ? 'SAMEORIGIN' : 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|images|fonts|api/v1/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
