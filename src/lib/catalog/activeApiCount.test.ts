import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getActiveApiCount } from './activeApiCount';

const { mockCountActive } = vi.hoisted(() => ({
  mockCountActive: vi.fn(),
}));

vi.mock('@/services/factory', () => ({
  createCatalogService: vi.fn(() => ({ countActive: mockCountActive })),
}));

describe('getActiveApiCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('활성 API 개수를 반환한다', async () => {
    mockCountActive.mockResolvedValue(23);

    expect(await getActiveApiCount()).toBe(23);
    expect(mockCountActive).toHaveBeenCalledTimes(1);
  });

  it('조회가 실패해도 0을 반환한다 (홈 렌더 보호)', async () => {
    mockCountActive.mockRejectedValue(new Error('db down'));

    expect(await getActiveApiCount()).toBe(0);
  });
});
