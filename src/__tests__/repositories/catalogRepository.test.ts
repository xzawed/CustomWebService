import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogRepository } from '@/repositories/catalogRepository';

const baseRow = {
  id: 'api-1',
  name: 'Test API',
  description: 'A test API',
  category: 'weather',
  base_url: 'https://api.example.com',
  auth_type: 'none',
  auth_config: {},
  rate_limit: null,
  is_active: true,
  icon_url: null,
  docs_url: null,
  endpoints: [],
  tags: [],
  api_version: null,
  deprecated_at: null,
  successor_id: null,
  cors_supported: true,
  requires_proxy: false,
  credit_required: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

function makeSupabase() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn(),
    delete: vi.fn().mockReturnThis(),
    in: vi.fn(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
  };
  return {
    chain,
    supabase: {
      from: vi.fn().mockReturnValue(chain),
    } as unknown as import('@supabase/supabase-js').SupabaseClient,
  };
}

describe('CatalogRepository — toDomain mapper (verification fields)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verificationStatus', () => {
    it('DB 컬럼이 null이면 "unverified"로 기본값 처리한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [{ ...baseRow, verification_status: null }],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.verificationStatus).toBe('unverified');
    });

    it('DB 컬럼이 "verified"이면 그대로 매핑한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [{ ...baseRow, verification_status: 'verified' }],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.verificationStatus).toBe('verified');
    });
  });

  describe('verifiedAt', () => {
    it('DB 컬럼이 null이면 null로 매핑한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [{ ...baseRow, verified_at: null }],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.verifiedAt).toBeNull();
    });

    it('DB 컬럼이 ISO 문자열이면 그대로 매핑한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [{ ...baseRow, verified_at: '2024-06-15T12:00:00Z' }],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.verifiedAt).toBe('2024-06-15T12:00:00Z');
    });
  });

  describe('lastVerificationNote', () => {
    it('DB 컬럼이 null이면 null로 매핑한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [{ ...baseRow, last_verification_note: null }],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.lastVerificationNote).toBeNull();
    });

    it('DB 컬럼에 메모가 있으면 그대로 매핑한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [{ ...baseRow, last_verification_note: 'API endpoint changed' }],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.lastVerificationNote).toBe('API endpoint changed');
    });
  });
});
