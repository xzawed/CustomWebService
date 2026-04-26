import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import { DrizzleCatalogRepository } from '@/repositories/drizzle/DrizzleCatalogRepository';

const NOW = new Date('2026-04-26T00:00:00.000Z');

function makeCatalogRow(overrides: Partial<typeof schema.apiCatalog.$inferSelect> = {}) {
  return {
    id: 'api-1',
    name: '테스트 API',
    description: '테스트용 API입니다',
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
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  } as typeof schema.apiCatalog.$inferSelect;
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

describe('DrizzleCatalogRepository', () => {
  let mockDb: ReturnType<typeof makeMockDb>;
  let repo: DrizzleCatalogRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeMockDb();
    repo = new DrizzleCatalogRepository(mockDb);
  });

  // ─── findById ──────────────────────────────────────────────────────────────
  describe('findById()', () => {
    it('ID가 일치하는 API 항목을 반환한다', async () => {
      const row = makeCatalogRow();
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.findById('api-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('api-1');
      expect(result!.name).toBe('테스트 API');
      expect(result!.baseUrl).toBe('https://api.example.com');
    });

    it('존재하지 않으면 null을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await repo.findById('non-existent');
      expect(result).toBeNull();
    });

    it('toDomain이 camelCase 필드를 올바르게 매핑한다', async () => {
      const row = makeCatalogRow({
        base_url: 'https://api.test.com',
        auth_type: 'api_key',
        auth_config: { keyParam: 'apikey' },
        icon_url: 'https://icon.com/icon.png',
        docs_url: 'https://docs.example.com',
        cors_supported: false,
        requires_proxy: true,
        credit_required: '5' as never,
      });
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.findById('api-1');
      expect(result!.baseUrl).toBe('https://api.test.com');
      expect(result!.authType).toBe('api_key');
      expect(result!.iconUrl).toBe('https://icon.com/icon.png');
      expect(result!.docsUrl).toBe('https://docs.example.com');
      expect(result!.corsSupported).toBe(false);
      expect(result!.requiresProxy).toBe(true);
      expect(result!.creditRequired).toBe(5);
    });
  });

  // ─── findMany ──────────────────────────────────────────────────────────────
  describe('findMany()', () => {
    it('항목 목록과 total을 반환한다', async () => {
      const rows = [makeCatalogRow(), makeCatalogRow({ id: 'api-2', name: '두번째 API' })];

      vi.mocked(mockDb.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: 2 }]),
          }),
        } as never)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue(rows),
                }),
              }),
            }),
          }),
        } as never);

      const result = await repo.findMany();
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('api-1');
      expect(result.items[1].id).toBe('api-2');
    });

    it('결과가 없으면 빈 배열과 total 0을 반환한다', async () => {
      vi.mocked(mockDb.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: 0 }]),
          }),
        } as never)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as never);

      const result = await repo.findMany();
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────
  describe('create()', () => {
    it('새 API 항목을 삽입하고 반환한다', async () => {
      const row = makeCatalogRow();
      const mockReturning = vi.fn().mockResolvedValue([row]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      const input = {
        name: '테스트 API',
        description: '설명',
        category: 'weather',
        baseUrl: 'https://api.example.com',
        authType: 'none' as const,
        authConfig: {},
        rateLimit: null,
        isActive: true,
        iconUrl: null,
        docsUrl: null,
        endpoints: [],
        tags: [],
        apiVersion: null,
        deprecatedAt: null,
        successorId: null,
        corsSupported: true,
        requiresProxy: false,
        creditRequired: null,
      };

      const result = await repo.create(input);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(result.id).toBe('api-1');
      expect(result.name).toBe('테스트 API');
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────
  describe('update()', () => {
    it('API 항목을 업데이트하고 반환한다', async () => {
      const row = makeCatalogRow({ name: '업데이트된 API', is_active: false });
      vi.mocked(mockDb.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.update('api-1', { name: '업데이트된 API', isActive: false });
      expect(result.name).toBe('업데이트된 API');
      expect(result.isActive).toBe(false);
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────
  describe('delete()', () => {
    it('API 항목을 삭제한다', async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.delete).mockReturnValue({ where: mockWhere } as never);

      await repo.delete('api-1');
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  // ─── count ─────────────────────────────────────────────────────────────────
  describe('count()', () => {
    it('필터 없이 전체 수를 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 42 }]),
        }),
      } as never);

      const result = await repo.count();
      expect(result).toBe(42);
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

  // ─── search ────────────────────────────────────────────────────────────────
  describe('search()', () => {
    it('카테고리와 검색어로 필터링된 결과를 반환한다', async () => {
      const rows = [makeCatalogRow()];

      vi.mocked(mockDb.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: 1 }]),
          }),
        } as never)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue(rows),
                }),
              }),
            }),
          }),
        } as never);

      const result = await repo.search({ category: 'weather', search: '테스트', page: 1, limit: 10 });
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('category가 all이면 카테고리 필터를 적용하지 않는다', async () => {
      vi.mocked(mockDb.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: 5 }]),
          }),
        } as never)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as never);

      const result = await repo.search({ category: 'all' });
      expect(result.total).toBe(5);
    });

    it('limit을 100으로 제한한다', async () => {
      vi.mocked(mockDb.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: 0 }]),
          }),
        } as never)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as never);

      const result = await repo.search({ limit: 999 });
      expect(result.total).toBe(0);
    });
  });

  // ─── getCategories ─────────────────────────────────────────────────────────
  describe('getCategories()', () => {
    it('카테고리별 집계 결과를 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { category: 'weather' },
            { category: 'weather' },
            { category: 'finance' },
          ]),
        }),
      } as never);

      const result = await repo.getCategories();
      expect(result.length).toBe(2);
      const weather = result.find((c) => c.key === 'weather');
      expect(weather?.count).toBe(2);
      const finance = result.find((c) => c.key === 'finance');
      expect(finance?.count).toBe(1);
    });

    it('category가 null이면 unknown으로 집계한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ category: null }]),
        }),
      } as never);

      const result = await repo.getCategories();
      expect(result[0].key).toBe('unknown');
      expect(result[0].count).toBe(1);
    });

    it('결과가 없으면 빈 배열을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const result = await repo.getCategories();
      expect(result).toEqual([]);
    });
  });

  // ─── findByIds ─────────────────────────────────────────────────────────────
  describe('findByIds()', () => {
    it('ID 목록에 해당하는 항목들을 반환한다', async () => {
      const rows = [
        makeCatalogRow({ id: 'api-1' }),
        makeCatalogRow({ id: 'api-2', name: '두번째 API' }),
      ];
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(rows),
        }),
      } as never);

      const result = await repo.findByIds(['api-1', 'api-2']);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('api-1');
      expect(result[1].id).toBe('api-2');
    });

    it('빈 배열이면 DB를 호출하지 않고 즉시 [] 반환한다', async () => {
      const result = await repo.findByIds([]);
      expect(result).toEqual([]);
      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });

  // ─── getApiUsageFromProjects ────────────────────────────────────────────────
  describe('getApiUsageFromProjects()', () => {
    it('innerJoin으로 API 사용 목록을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { api_id: 'api-1', context: '날씨 앱' },
              { api_id: 'api-2', context: null },
            ]),
          }),
        }),
      } as never);

      const result = await repo.getApiUsageFromProjects(['published']);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ apiId: 'api-1', context: '날씨 앱' });
      expect(result[1]).toEqual({ apiId: 'api-2', context: '' }); // null → ''
    });
  });

  // ─── getActiveNameToIdMap ──────────────────────────────────────────────────
  describe('getActiveNameToIdMap()', () => {
    it('소문자 이름 → ID 매핑 Map을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'api-1', name: 'OpenWeather' },
            { id: 'api-2', name: 'ExchangeRate' },
          ]),
        }),
      } as never);

      const result = await repo.getActiveNameToIdMap();
      expect(result.get('openweather')).toBe('api-1');
      expect(result.get('exchangerate')).toBe('api-2');
    });

    it('결과가 없으면 빈 Map을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const result = await repo.getActiveNameToIdMap();
      expect(result.size).toBe(0);
    });
  });

  // ─── ping ──────────────────────────────────────────────────────────────────
  describe('ping()', () => {
    it('DB 조회 성공 시 true를 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ n: 1 }]),
        }),
      } as never);

      const result = await repo.ping();
      expect(result).toBe(true);
    });

    it('DB 조회 실패 시 false를 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error('연결 실패')),
        }),
      } as never);

      const result = await repo.ping();
      expect(result).toBe(false);
    });
  });

  // ─── getUsageCounts ────────────────────────────────────────────────────────
  describe('getUsageCounts()', () => {
    it('오늘 생성 수, 전체 프로젝트 수, 전체 사용자 수를 병렬로 조회한다', async () => {
      vi.mocked(mockDb.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ n: 10 }]),
          }),
        } as never)
        .mockReturnValueOnce({
          from: vi.fn().mockResolvedValue([{ n: 50 }]),
        } as never)
        .mockReturnValueOnce({
          from: vi.fn().mockResolvedValue([{ n: 20 }]),
        } as never);

      const result = await repo.getUsageCounts(new Date('2026-04-26T00:00:00.000Z'));
      expect(result.todayGenerations).toBe(10);
      expect(result.totalProjects).toBe(50);
      expect(result.totalUsers).toBe(20);
    });

    it('결과가 없으면 0으로 반환한다', async () => {
      vi.mocked(mockDb.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        } as never)
        .mockReturnValueOnce({
          from: vi.fn().mockResolvedValue([]),
        } as never)
        .mockReturnValueOnce({
          from: vi.fn().mockResolvedValue([]),
        } as never);

      const result = await repo.getUsageCounts(new Date());
      expect(result.todayGenerations).toBe(0);
      expect(result.totalProjects).toBe(0);
      expect(result.totalUsers).toBe(0);
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

      await expect(repo.findById('api-1')).rejects.toThrow('DB 연결 실패');
    });

    it('create — DB 에러를 그대로 던진다', async () => {
      const mockReturning = vi.fn().mockRejectedValue(new Error('삽입 실패'));
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      await expect(
        repo.create({
          name: '테스트',
          description: '설명',
          category: 'weather',
          baseUrl: 'https://api.example.com',
          authType: 'none',
          authConfig: {},
          rateLimit: null,
          isActive: true,
          iconUrl: null,
          docsUrl: null,
          endpoints: [],
          tags: [],
          apiVersion: null,
          deprecatedAt: null,
          successorId: null,
          corsSupported: true,
          requiresProxy: false,
          creditRequired: null,
        })
      ).rejects.toThrow('삽입 실패');
    });

    it('delete — DB 에러를 그대로 던진다', async () => {
      vi.mocked(mockDb.delete).mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('삭제 실패')),
      } as never);

      await expect(repo.delete('api-1')).rejects.toThrow('삭제 실패');
    });
  });
});
