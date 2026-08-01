/**
 * A. Subdomain passthrough — 2026-07-28 outage class.
 *
 * Host: e2e-fixture.xzawed.xyz + GET /api/v1/proxy?... must reach the proxy
 * route (JSON error is fine), not site HTML and not a rewrite 404.
 *
 * Fail-closed: first assertion requires the fixture marker on subdomain GET /
 * so a dead rewrite (landing HTML) fails the suite rather than passing vacuously.
 */
import { test, expect } from '@playwright/test';
import { requestWithHost } from '../helpers/httpHost';
import { loadFixtures } from '../helpers/loadFixtures';

test.describe('A. subdomain passthrough', () => {
  test('subdomain Host rewrite serves fixture marker (fail-closed gate)', async () => {
    const fixtures = loadFixtures();
    const res = await requestWithHost({
      host: fixtures.subdomainHost,
      path: '/',
    });

    expect(res.status, 'subdomain site should be 200').toBe(200);
    // If NEXT_PUBLIC_ROOT_DOMAIN is missing or Host is ignored, we get the
    // landing page — which must not pass.
    expect(
      res.body,
      'body must contain fixture marker; landing HTML means rewrite did not fire',
    ).toContain(fixtures.marker);
    expect(res.body).not.toMatch(/무료로 시작하기/);
  });

  test('GET /api/v1/proxy under subdomain Host reaches proxy route (not site HTML)', async () => {
    const fixtures = loadFixtures();
    // Missing apiId/proxyPath → proxy validation 400 JSON. Proves passthrough.
    const res = await requestWithHost({
      host: fixtures.subdomainHost,
      path: '/api/v1/proxy',
    });

    expect(res.status).toBe(400);
    expect(res.headers['content-type'] ?? '').toMatch(/json/i);

    let json: unknown;
    expect(() => {
      json = JSON.parse(res.body);
    }).not.toThrow();

    expect(json).toMatchObject({
      success: false,
      error: expect.objectContaining({
        code: expect.any(String),
        message: expect.any(String),
      }),
    });

    // Must not be rewritten to /site/{slug}/api/... HTML.
    expect(res.body).not.toContain(fixtures.marker);
    expect(res.body).not.toMatch(/<!DOCTYPE html>/i);
  });
});
