/**
 * 공용 CDN 호스트 목록.
 *
 * AI가 생성한 사용자 페이지가 의존하는 외부 CDN을 단일 출처에 모은다.
 * `site/[slug]/route.ts`, `preview/[projectId]/route.ts`, `promptBuilder.ts`가
 * 동일 목록을 참조하도록 보장 — CDN 추가/제거 시 한 곳만 수정.
 *
 * **주의**: 메인 앱(`/`, `/builder` 등)의 CSP는 `middleware.ts`에서 관리되며
 * 다른 정책(nonce 기반 script-src)을 사용하므로 이 상수와 별개다.
 */

/** Tailwind, Font Awesome, Pretendard 등 사용자 페이지 script-src 화이트리스트 */
export const SITE_SCRIPT_CDNS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net',
  'https://cdnjs.cloudflare.com',
  'https://kit.fontawesome.com',
  'https://use.fontawesome.com',
  'https://stackpath.bootstrapcdn.com',
  'https://unpkg.com',
] as const;

/** 사용자 페이지 style-src 화이트리스트 (Google Fonts 포함) */
export const SITE_STYLE_CDNS = [
  'https://fonts.googleapis.com',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net',
  'https://cdnjs.cloudflare.com',
  'https://stackpath.bootstrapcdn.com',
  'https://unpkg.com',
] as const;

/** 사용자 페이지 font-src 화이트리스트 (data: 포함) */
export const SITE_FONT_CDNS = [
  'https://fonts.gstatic.com',
  'https://cdn.jsdelivr.net',
  'https://cdnjs.cloudflare.com',
  'https://use.fontawesome.com',
  'https://kit.fontawesome.com',
] as const;

/**
 * 사용자 페이지에 적용되는 CSP 문자열을 생성한다.
 * Alpine.js x-data 등 인라인 속성 평가에 'unsafe-eval'이 필요하므로 nonce 정책 대신
 * 화이트리스트 기반. `frameAncestors`만 호출처마다 다름:
 * - 서브도메인 게시(`/site/[slug]`): `'none'` — 외부 임베드 차단
 * - 미리보기(`/preview/[projectId]`): `'self'` — 메인 앱 iframe 허용
 */
export function buildSiteCsp(frameAncestors: "'none'" | "'self'"): string {
  return [
    "default-src 'self'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${SITE_SCRIPT_CDNS.join(' ')}`,
    `style-src 'unsafe-inline' ${SITE_STYLE_CDNS.join(' ')}`,
    `font-src ${SITE_FONT_CDNS.join(' ')} data:`,
    'img-src * data: blob:',
    "connect-src 'self' https: wss:",
    `frame-ancestors ${frameAncestors}`,
  ].join('; ');
}

/** 서브도메인 게시(`/site/[slug]`) 전용 CSP — frame-ancestors 'none' */
export const SITE_CSP = buildSiteCsp("'none'");

/** 미리보기(`/preview/[projectId]`) 전용 CSP — frame-ancestors 'self' */
export const PREVIEW_CSP = buildSiteCsp("'self'");
