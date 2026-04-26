import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import { DrizzleCodeRepository, codeRowToDomain } from '@/repositories/drizzle/DrizzleCodeRepository';

const NOW = new Date('2026-04-26T00:00:00.000Z');

function makeCodeRow(overrides: Partial<typeof schema.generatedCodes.$inferSelect> = {}) {
  return {
    id: 'code-1',
    project_id: 'proj-1',
    version: 1,
    code_html: '<html></html>',
    code_css: 'body{}',
    code_js: 'console.log(1)',
    framework: 'vanilla',
    ai_provider: 'anthropic',
    ai_model: 'claude-opus-4-7',
    ai_prompt_used: 'test prompt',
    generation_time_ms: 1000,
    token_usage: { input: 100, output: 200 },
    dependencies: [],
    metadata: {},
    created_at: NOW,
    ...overrides,
  } as typeof schema.generatedCodes.$inferSelect;
}

function makeMockDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  } as unknown as NodePgDatabase<typeof schema>;
}

describe('codeRowToDomain()', () => {
  it('DB 행을 도메인 객체로 변환한다', () => {
    const row = makeCodeRow();
    const domain = codeRowToDomain(row);

    expect(domain.id).toBe('code-1');
    expect(domain.projectId).toBe('proj-1');
    expect(domain.version).toBe(1);
    expect(domain.codeHtml).toBe('<html></html>');
    expect(domain.codeCss).toBe('body{}');
    expect(domain.codeJs).toBe('console.log(1)');
    expect(domain.framework).toBe('vanilla');
    expect(domain.aiProvider).toBe('anthropic');
    expect(domain.createdAt).toBe(String(NOW));
  });

  it('null 필드를 기본값으로 처리한다', () => {
    const row = makeCodeRow({
      code_html: null,
      code_css: null,
      code_js: null,
      framework: null as never,
      ai_provider: null,
      ai_model: null,
      ai_prompt_used: null,
      generation_time_ms: null,
      token_usage: null,
      dependencies: null as never,
      metadata: null,
    });
    const domain = codeRowToDomain(row);

    expect(domain.codeHtml).toBe('');
    expect(domain.codeCss).toBe('');
    expect(domain.codeJs).toBe('');
    expect(domain.framework).toBe('vanilla');
    expect(domain.aiProvider).toBeNull();
    expect(domain.aiModel).toBeNull();
    expect(domain.generationTimeMs).toBeNull();
    expect(domain.tokenUsage).toBeNull();
    expect(domain.dependencies).toEqual([]);
    expect(domain.metadata).toEqual({});
  });
});

describe('DrizzleCodeRepository', () => {
  let mockDb: ReturnType<typeof makeMockDb>;
  let repo: DrizzleCodeRepository;

  beforeEach(() => {
    mockDb = makeMockDb();
    repo = new DrizzleCodeRepository(mockDb);
  });

  // ─── findById ──────────────────────────────────────────────────────────────
  describe('findById()', () => {
    it('ID로 코드를 조회한다', async () => {
      const row = makeCodeRow();
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.findById('code-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('code-1');
    });

    it('존재하지 않으면 null을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await repo.findById('missing');
      expect(result).toBeNull();
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────
  describe('create()', () => {
    it('코드를 생성하고 반환한다', async () => {
      const row = makeCodeRow();
      vi.mocked(mockDb.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([row]),
        }),
      } as never);

      const result = await repo.create({
        projectId: 'proj-1',
        version: 1,
        codeHtml: '<html></html>',
        codeCss: 'body{}',
        codeJs: 'console.log(1)',
        framework: 'vanilla',
        aiProvider: 'anthropic',
        aiModel: 'claude-opus-4-7',
        aiPromptUsed: null,
        generationTimeMs: null,
        tokenUsage: null,
        dependencies: [],
        metadata: {},
      });

      expect(result.id).toBe('code-1');
      expect(mockDb.insert).toHaveBeenCalledOnce();
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────
  describe('update()', () => {
    it('코드를 업데이트하고 반환한다', async () => {
      const row = makeCodeRow({ code_html: '<html>updated</html>' });
      vi.mocked(mockDb.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.update('code-1', { codeHtml: '<html>updated</html>' });
      expect(result.codeHtml).toBe('<html>updated</html>');
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────
  describe('delete()', () => {
    it('코드를 삭제한다', async () => {
      vi.mocked(mockDb.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as never);

      await expect(repo.delete('code-1')).resolves.toBeUndefined();
      expect(mockDb.delete).toHaveBeenCalledOnce();
    });
  });

  // ─── count ─────────────────────────────────────────────────────────────────
  describe('count()', () => {
    it('코드 수를 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 5 }]),
        }),
      } as never);

      const result = await repo.count();
      expect(result).toBe(5);
    });

    it('결과가 없으면 0을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const result = await repo.count();
      expect(result).toBe(0);
    });
  });

  // ─── findByProject ─────────────────────────────────────────────────────────
  describe('findByProject()', () => {
    it('버전 지정 시 해당 버전을 반환한다', async () => {
      const row = makeCodeRow({ version: 2 });
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.findByProject('proj-1', 2);
      expect(result!.version).toBe(2);
    });

    it('버전 미지정 시 최신 버전을 반환한다', async () => {
      const row = makeCodeRow({ version: 3 });
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([row]),
            }),
          }),
        }),
      } as never);

      const result = await repo.findByProject('proj-1');
      expect(result!.version).toBe(3);
    });

    it('코드가 없으면 null을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      const result = await repo.findByProject('proj-no-code');
      expect(result).toBeNull();
    });
  });

  // ─── countByProject ────────────────────────────────────────────────────────
  describe('countByProject()', () => {
    it('프로젝트의 코드 버전 수를 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 3 }]),
        }),
      } as never);

      const result = await repo.countByProject('proj-1');
      expect(result).toBe(3);
    });
  });

  // ─── pruneOldVersions ──────────────────────────────────────────────────────
  describe('pruneOldVersions()', () => {
    it('삭제할 버전이 없으면 execute를 호출하지 않는다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      await repo.pruneOldVersions('proj-1', 5);
      expect(mockDb.execute).not.toHaveBeenCalled();
    });

    it('keepCount 초과 버전을 삭제한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([{ id: 'code-old-1' }, { id: 'code-old-2' }]),
            }),
          }),
        }),
      } as never);
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [] } as never);

      await repo.pruneOldVersions('proj-1', 3);
      expect(mockDb.execute).toHaveBeenCalledOnce();
    });
  });

  // ─── getNextVersion ────────────────────────────────────────────────────────
  describe('getNextVersion()', () => {
    it('코드가 없으면 1을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      const result = await repo.getNextVersion('proj-new');
      expect(result).toBe(1);
    });

    it('최신 버전 + 1을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ version: 4 }]),
            }),
          }),
        }),
      } as never);

      const result = await repo.getNextVersion('proj-1');
      expect(result).toBe(5);
    });

    it('version이 null이면 1을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ version: null }]),
            }),
          }),
        }),
      } as never);

      const result = await repo.getNextVersion('proj-1');
      expect(result).toBe(1);
    });
  });

  // ─── 에러 전파 ─────────────────────────────────────────────────────────────
  describe('에러 전파', () => {
    it('findById — DB 에러를 그대로 던진다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('DB 연결 실패')),
          }),
        }),
      } as never);

      await expect(repo.findById('code-1')).rejects.toThrow('DB 연결 실패');
    });

    it('create — DB 에러를 그대로 던진다', async () => {
      vi.mocked(mockDb.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('unique violation')),
        }),
      } as never);

      await expect(
        repo.create({
          projectId: 'proj-1',
          version: 1,
          codeHtml: '',
          codeCss: '',
          codeJs: '',
          framework: 'vanilla',
          aiProvider: null,
          aiModel: null,
          aiPromptUsed: null,
          generationTimeMs: null,
          tokenUsage: null,
          dependencies: [],
          metadata: {},
        })
      ).rejects.toThrow('unique violation');
    });
  });
});
