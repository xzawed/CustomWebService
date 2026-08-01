/**
 * C. CSP — exactly one Content-Security-Policy header on site/subdomain/preview.
 * Use raw headers (headersArray / rawHeaders), not collapsed object form.
 */
import { test, expect } from '@playwright/test';
import { countHeader, getHeaderValues, requestWithHost } from '../helpers/httpHost';
import { loadFixtures } from '../helpers/loadFixtures';
// 소스에서 직접 가져온다 — 목록을 복사해 두면 CDN이 추가돼도 테스트가 눈치채지 못한다.
// cdn.ts 는 import 가 없는 순수 상수 파일이라 상대경로로 그대로 로드된다.
import {
  SITE_FONT_CDNS,
  SITE_SCRIPT_CDNS,
  SITE_STYLE_CDNS,
} from '../../src/lib/constants/cdn';

const CDN_HOSTS = [
  ...SITE_SCRIPT_CDNS,
  ...SITE_STYLE_CDNS,
  ...SITE_FONT_CDNS,
] as const;

test.describe('C. CSP single-header contract', () => {
  test('published-direct has exactly one CSP including CDN hosts and frame-ancestors none', async ({
    request,
  }) => {
    const fixtures = loadFixtures();
    const res = await request.get(`/site/${fixtures.slug}`);
    expect(res.status()).toBe(200);

    // Playwright APIResponse.headersArray() preserves duplicates.
    const cspHeaders = res.headersArray().filter((h) => h.name.toLowerCase() === 'content-security-policy');
    expect(cspHeaders, 'exactly one CSP header on /site').toHaveLength(1);

    const csp = cspHeaders[0].value;
    for (const host of CDN_HOSTS) {
      expect(csp, `CSP must allow ${host}`).toContain(host);
    }
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("frame-ancestors 'self'");
  });

  test('published-subdomain has exactly one CSP with CDN hosts', async () => {
    const fixtures = loadFixtures();
    const res = await requestWithHost({
      host: fixtures.subdomainHost,
      path: '/',
    });
    expect(res.status).toBe(200);
    expect(res.body).toContain(fixtures.marker);

    expect(countHeader(res.rawHeaders, 'content-security-policy')).toBe(1);
    const [csp] = getHeaderValues(res.rawHeaders, 'content-security-policy');
    for (const host of CDN_HOSTS) {
      expect(csp).toContain(host);
    }
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("preview CSP is single, includes CDNs, and uses frame-ancestors 'self'", async ({
    request,
  }) => {
    const fixtures = loadFixtures();
    const res = await request.get(`/api/v1/preview/${fixtures.publishedProjectId}`);
    expect(res.status()).toBe(200);

    const cspHeaders = res.headersArray().filter((h) => h.name.toLowerCase() === 'content-security-policy');
    expect(cspHeaders, 'exactly one CSP on preview').toHaveLength(1);

    const csp = cspHeaders[0].value;
    for (const host of CDN_HOSTS) {
      expect(csp).toContain(host);
    }
    // Intentional difference vs site — do not force equality.
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("frame-ancestors 'none'");
  });
});
