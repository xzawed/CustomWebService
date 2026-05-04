import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CodeRepository } from './codeRepository';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Chain for findByProject() — resolves via .single() */
function makeSingleChain(result: { data: unknown | null; error: unknown | null }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

/** Chain for findMetadataByDateRange() — resolves via .order() */
function makeMetadataChain(result: { data: unknown[] | null; error: unknown | null }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

const baseRow = {
  id: 'code-1',
  project_id: 'proj-1',
  version: 3,
  code_html: '<html></html>',
  code_css: 'body {}',
  code_js: 'console.log(1)',
  framework: 'vanilla',
  ai_provider: 'anthropic',
  ai_model: 'claude-opus-4-7',
  ai_prompt_used: 'build a weather app',
  generation_time_ms: 5000,
  token_usage: { input: 100, output: 200 },
  dependencies: [],
  metadata: { qualityScore: 80 },
  created_at: '2024-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// findByProject() tests
// ---------------------------------------------------------------------------

describe('CodeRepository — findByProject()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('version 미지정 → order(version, desc) + limit(1) + single() 호출', async () => {
    const chain = makeSingleChain({ data: baseRow, error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CodeRepository(supabase);

    const result = await repo.findByProject('proj-1');

    expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('generated_codes');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('project_id', 'proj-1');
    expect(chain.order).toHaveBeenCalledWith('version', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(chain.single).toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.projectId).toBe('proj-1');
    expect(result?.version).toBe(3);
  });

  it('version 지정 → eq(version) 추가, order/limit 호출 안 함', async () => {
    const chain = makeSingleChain({ data: { ...baseRow, version: 2 }, error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CodeRepository(supabase);

    const result = await repo.findByProject('proj-1', 2);

    const eqCalls = chain.eq.mock.calls.map((c: unknown[]) => c[0]);
    expect(eqCalls).toContain('version');
    expect(chain.eq).toHaveBeenCalledWith('version', 2);
    expect(chain.order).not.toHaveBeenCalled();
    expect(chain.limit).not.toHaveBeenCalled();
    expect(result?.version).toBe(2);
  });

  it('PGRST116 에러 → null 반환 (코드 미존재)', async () => {
    const chain = makeSingleChain({
      data: null,
      error: { code: 'PGRST116', message: 'Row not found' },
    });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CodeRepository(supabase);

    const result = await repo.findByProject('proj-1');

    expect(result).toBeNull();
  });

  it('PGRST116 이외 에러 → throw한다', async () => {
    const dbError = { code: '42P01', message: 'table not found' };
    const chain = makeSingleChain({ data: null, error: dbError });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CodeRepository(supabase);

    await expect(repo.findByProject('proj-1')).rejects.toEqual(dbError);
  });

  it('toDomain 매핑: nullable 필드 기본값 처리', async () => {
    const sparseRow = {
      id: 'code-2',
      project_id: 'proj-2',
      version: 1,
      code_html: null,
      code_css: null,
      code_js: null,
      framework: null,
      ai_provider: null,
      ai_model: null,
      ai_prompt_used: null,
      generation_time_ms: null,
      token_usage: null,
      dependencies: null,
      metadata: null,
      created_at: '2024-01-01T00:00:00Z',
    };
    const chain = makeSingleChain({ data: sparseRow, error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CodeRepository(supabase);

    const result = await repo.findByProject('proj-2');

    expect(result?.codeHtml).toBe('');
    expect(result?.codeCss).toBe('');
    expect(result?.codeJs).toBe('');
    expect(result?.framework).toBe('vanilla');
    expect(result?.dependencies).toEqual([]);
    expect(result?.metadata).toEqual({});
    expect(result?.aiProvider).toBeNull();
    expect(result?.tokenUsage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findMetadataByDateRange() tests
// ---------------------------------------------------------------------------

describe('CodeRepository — findMetadataByDateRange()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('from 날짜로 gte 필터를 걸고 created_at desc 정렬', async () => {
    const fromDate = new Date('2024-01-01T00:00:00Z');
    const rows = [
      { metadata: { qualityScore: 80 }, created_at: '2024-01-02T00:00:00Z' },
      { metadata: { qualityScore: 70 }, created_at: '2024-01-01T12:00:00Z' },
    ];
    const chain = makeMetadataChain({ data: rows, error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CodeRepository(supabase);

    const result = await repo.findMetadataByDateRange(fromDate);

    expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('generated_codes');
    expect(chain.select).toHaveBeenCalledWith('metadata, created_at');
    expect(chain.gte).toHaveBeenCalledWith('created_at', fromDate.toISOString());
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result).toHaveLength(2);
    expect(result[0].metadata).toEqual({ qualityScore: 80 });
    expect(result[0].createdAt).toBe('2024-01-02T00:00:00Z');
  });

  it('metadata가 null인 행은 {} 로 변환한다', async () => {
    const rows = [
      { metadata: null, created_at: '2024-01-01T00:00:00Z' },
    ];
    const chain = makeMetadataChain({ data: rows, error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CodeRepository(supabase);

    const result = await repo.findMetadataByDateRange(new Date('2024-01-01'));

    expect(result[0].metadata).toEqual({});
  });

  it('data가 null → 빈 배열 반환', async () => {
    const chain = makeMetadataChain({ data: null, error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CodeRepository(supabase);

    const result = await repo.findMetadataByDateRange(new Date());

    expect(result).toEqual([]);
  });

  it('데이터가 없으면 빈 배열을 반환한다', async () => {
    const chain = makeMetadataChain({ data: [], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CodeRepository(supabase);

    const result = await repo.findMetadataByDateRange(new Date());

    expect(result).toEqual([]);
  });

  it('DB 에러 발생 시 throw한다', async () => {
    const dbError = { code: '42P01', message: 'table not found' };
    const chain = makeMetadataChain({ data: null, error: dbError });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CodeRepository(supabase);

    await expect(repo.findMetadataByDateRange(new Date())).rejects.toEqual(dbError);
  });

  it('여러 행이 있는 경우 전체 배열을 반환한다', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      metadata: { index: i },
      created_at: `2024-01-0${i + 1}T00:00:00Z`,
    }));
    const chain = makeMetadataChain({ data: rows, error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CodeRepository(supabase);

    const result = await repo.findMetadataByDateRange(new Date('2024-01-01'));

    expect(result).toHaveLength(5);
    expect(result[2].metadata).toEqual({ index: 2 });
  });
});
