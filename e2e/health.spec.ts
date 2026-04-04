import { test, expect } from '@playwright/test';

test.describe('API Health', () => {
  test('헬스 체크 엔드포인트가 정상 응답한다', async ({ request }) => {
    const response = await request.get('/api/v1/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('status');
  });

  test('카탈로그 엔드포인트가 정상 응답한다', async ({ request }) => {
    const response = await request.get('/api/v1/catalog');
    expect(response.status()).toBe(200);
  });
});
