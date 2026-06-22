import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getActiveApiCount } from './activeApiCount';

const { mockCountActive, mockGetDbProvider, mockCreateClient } = vi.hoisted(() => ({
  mockCountActive: vi.fn(),
  mockGetDbProvider: vi.fn(),
  mockCreateClient: vi.fn(() => ({})),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }));
vi.mock('@/lib/config/providers', () => ({ getDbProvider: mockGetDbProvider }));
vi.mock('@/services/factory', () => ({
  createCatalogService: vi.fn(() => ({ countActive: mockCountActive })),
}));

describe('getActiveApiCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDbProvider.mockReturnValue('supabase');
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('활성 API 개수를 반환한다', async () => {
    mockCountActive.mockResolvedValue(23);

    expect(await getActiveApiCount()).toBe(23);
    expect(mockCreateClient).toHaveBeenCalledWith('http://localhost:54321', 'anon-key');
  });

  it('supabase env가 없으면 0을 반환한다', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(await getActiveApiCount()).toBe(0);
    expect(mockCountActive).not.toHaveBeenCalled();
  });

  it('조회가 실패해도 0을 반환한다 (홈 렌더 보호)', async () => {
    mockCountActive.mockRejectedValue(new Error('db down'));

    expect(await getActiveApiCount()).toBe(0);
  });

  it('postgres 프로바이더면 클라이언트 없이 조회한다', async () => {
    mockGetDbProvider.mockReturnValue('postgres');
    mockCountActive.mockResolvedValue(23);

    expect(await getActiveApiCount()).toBe(23);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
