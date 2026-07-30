/**
 * Auth.js v5 JWT 세션 쿠키 만료 헤더.
 * 서버 측 계정 삭제 후 클라이언트의 유령 JWT를 즉시 무효화한다.
 * (chunked session token `.0`/`.1` 포함)
 */
export function buildAuthSessionClearCookieHeaders(): string[] {
  const secure = process.env.NODE_ENV === 'production';
  const baseNames = secure
    ? [
        '__Secure-authjs.session-token',
        '__Secure-authjs.callback-url',
        '__Host-authjs.csrf-token',
      ]
    : ['authjs.session-token', 'authjs.callback-url', 'authjs.csrf-token'];

  // session-token은 길면 `.0`, `.1` 로 청크된다.
  const names = [
    ...baseNames,
    ...baseNames
      .filter((n) => n.endsWith('session-token'))
      .flatMap((n) => [`${n}.0`, `${n}.1`, `${n}.2`]),
  ];

  return names.map((name) => {
    const isHost = name.startsWith('__Host-');
    const parts = [
      `${name}=`,
      'Path=/',
      'Max-Age=0',
      'HttpOnly',
      'SameSite=Lax',
    ];
    if (secure || isHost) parts.push('Secure');
    return parts.join('; ');
  });
}

/** Response Headers에 세션 만료 Set-Cookie를 붙인다. */
export function appendAuthSessionClearCookies(headers: Headers): void {
  for (const cookie of buildAuthSessionClearCookieHeaders()) {
    headers.append('Set-Cookie', cookie);
  }
}
