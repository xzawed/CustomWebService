import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAuthSessionClearCookieHeaders } from './clearAuthSessionCookies';

describe('buildAuthSessionClearCookieHeaders', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('개발 환경에서 authjs.session-token Max-Age=0 헤더를 만든다', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const headers = buildAuthSessionClearCookieHeaders();
    const joined = headers.join('\n');
    expect(joined).toContain('authjs.session-token=');
    expect(joined).toMatch(/Max-Age=0/);
    expect(joined).toContain('authjs.session-token.0=');
  });
});
