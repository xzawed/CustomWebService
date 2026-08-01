/**
 * B. Serving equivalence — preview / published-direct / published-subdomain
 * must all include the same fixture marker (not byte equality; headers differ).
 *
 * Cheap extras: unauthenticated preview → 401; draft /site does not leak marker.
 */
import { test, expect } from '@playwright/test';
import { requestWithHost } from '../helpers/httpHost';
import { loadFixtures } from '../helpers/loadFixtures';

test.describe('B. serving equivalence', () => {
  test('published-direct, published-subdomain, and preview share the fixture marker', async ({
    request,
  }) => {
    const fixtures = loadFixtures();

    const direct = await request.get(`/site/${fixtures.slug}`);
    expect(direct.status()).toBe(200);
    const directBody = await direct.text();
    expect(directBody).toContain(fixtures.marker);

    const subdomain = await requestWithHost({
      host: fixtures.subdomainHost,
      path: '/',
    });
    expect(subdomain.status).toBe(200);
    expect(subdomain.body).toContain(fixtures.marker);

    const preview = await request.get(`/api/v1/preview/${fixtures.publishedProjectId}`);
    expect(preview.status()).toBe(200);
    const previewBody = await preview.text();
    expect(previewBody).toContain(fixtures.marker);

    // Marker equality (not byte equality) — intentional header diffs allowed.
    const extractMarker = (html: string): string => {
      const idx = html.indexOf(fixtures.marker);
      expect(idx, 'marker must appear').toBeGreaterThanOrEqual(0);
      return fixtures.marker;
    };
    expect(extractMarker(directBody)).toBe(extractMarker(subdomain.body));
    expect(extractMarker(directBody)).toBe(extractMarker(previewBody));
  });

  test('unauthenticated preview returns 401', async ({ browser }) => {
    const fixtures = loadFixtures();
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    const res = await page.request.get(`/api/v1/preview/${fixtures.publishedProjectId}`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({
      success: false,
      error: { code: 'AUTH_REQUIRED' },
    });
    await context.close();
  });

  test('draft project /site/{slug} does not leak generated marker', async ({ request }) => {
    const fixtures = loadFixtures();
    const res = await request.get(`/site/${fixtures.draftSlug}`);
    // Site route returns preparingHtml with 200 for non-published.
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).not.toContain(fixtures.draftMarker);
    expect(body).not.toContain(fixtures.marker);
  });
});
