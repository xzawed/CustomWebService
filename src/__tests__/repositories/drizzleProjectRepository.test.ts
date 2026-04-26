import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import { DrizzleProjectRepository } from '@/repositories/drizzle/DrizzleProjectRepository';

const NOW = new Date('2026-04-26T00:00:00.000Z');

function makeProjectRow(overrides: Partial<typeof schema.projects.$inferSelect> = {}) {
  return {
    id: 'proj-1',
    user_id: 'user-1',
    organization_id: null,
    name: '테스트 프로젝트',
    context: '테스트 컨텍스트',
    status: 'draft',
    deploy_url: null,
    deploy_platform: null,
    repo_url: null,
    preview_url: null,
    metadata: {},
    current_version: 0,
    slug: null,
    suggested_slugs: null,
    published_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  } as typeof schema.projects.$inferSelect;
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

describe('DrizzleProjectRepository', () => {
  let mockDb: ReturnType<typeof makeMockDb>;
  let repo: DrizzleProjectRepository;

  beforeEach(() => {
    mockDb = makeMockDb();
    repo = new DrizzleProjectRepository(mockDb);
  });

  // ─── findByUserId ──────────────────────────────────────────────────────────
  describe('findByUserId()', () => {
    it('사용자의 프로젝트 목록을 반환한다', async () => {
      const rows = [
        makeProjectRow(),
        makeProjectRow({ id: 'proj-2', name: '두번째 프로젝트' }),
      ];
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(rows),
          }),
        }),
      } as never);

      const result = await repo.findByUserId('user-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('proj-1');
      expect(result[1].id).toBe('proj-2');
    });

    it('프로젝트가 없으면 빈 배열을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await repo.findByUserId('user-no-projects');
      expect(result).toEqual([]);
    });

    it('toDomain이 apis 필드를 빈 배열로 초기화한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([makeProjectRow()]),
          }),
        }),
      } as never);

      const [project] = await repo.findByUserId('user-1');
      expect(project.apis).toEqual([]);
    });
  });

  // ─── findBySlug ────────────────────────────────────────────────────────────
  describe('findBySlug()', () => {
    it('slug가 일치하는 프로젝트를 반환한다', async () => {
      const row = makeProjectRow({ slug: 'my-app', status: 'published' });
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.findBySlug('my-app');
      expect(result).not.toBeNull();
      expect(result!.slug).toBe('my-app');
      expect(result!.status).toBe('published');
    });

    it('slug가 없으면 null을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await repo.findBySlug('non-existent');
      expect(result).toBeNull();
    });
  });

  // ─── updateSlug ────────────────────────────────────────────────────────────
  describe('updateSlug()', () => {
    it('slug, publishedAt, status=published를 업데이트하고 프로젝트를 반환한다', async () => {
      const publishedAt = new Date('2026-04-26T10:00:00.000Z');
      const row = makeProjectRow({
        slug: 'new-slug',
        status: 'published',
        published_at: publishedAt,
      });
      vi.mocked(mockDb.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.updateSlug('proj-1', 'new-slug', publishedAt);
      expect(result.slug).toBe('new-slug');
      expect(result.status).toBe('published');
      expect(result.publishedAt).toBe(String(publishedAt));
    });
  });

  // ─── insertProjectApis ─────────────────────────────────────────────────────
  describe('insertProjectApis()', () => {
    it('API 매핑을 삽입한다', async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      await repo.insertProjectApis('proj-1', ['api-1', 'api-2']);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith([
        { project_id: 'proj-1', api_id: 'api-1' },
        { project_id: 'proj-1', api_id: 'api-2' },
      ]);
    });

    it('빈 배열이면 insert를 호출하지 않는다', async () => {
      await repo.insertProjectApis('proj-1', []);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  // ─── getProjectApiIds ──────────────────────────────────────────────────────
  describe('getProjectApiIds()', () => {
    it('프로젝트의 API ID 목록을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ api_id: 'api-1' }, { api_id: 'api-2' }]),
        }),
      } as never);

      const result = await repo.getProjectApiIds('proj-1');
      expect(result).toEqual(['api-1', 'api-2']);
    });

    it('API가 없으면 빈 배열을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const result = await repo.getProjectApiIds('proj-no-apis');
      expect(result).toEqual([]);
    });
  });

  // ─── countTodayGenerations ─────────────────────────────────────────────────
  describe('countTodayGenerations()', () => {
    it('오늘 생성한 코드 수를 반환한다', async () => {
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [{ cnt: 3 }] } as never);
      expect(await repo.countTodayGenerations('user-1')).toBe(3);
    });

    it('생성 기록이 없으면 0을 반환한다', async () => {
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [{ cnt: 0 }] } as never);
      expect(await repo.countTodayGenerations('user-1')).toBe(0);
    });

    it('rows가 비어있으면 0을 반환한다', async () => {
      vi.mocked(mockDb.execute).mockResolvedValue({ rows: [] } as never);
      expect(await repo.countTodayGenerations('user-1')).toBe(0);
    });
  });

  // ─── toDomain() null 처리 ──────────────────────────────────────────────────
  describe('toDomain() null 필드 처리', () => {
    it('nullable 컬럼을 올바른 기본값으로 매핑한다', async () => {
      const row = makeProjectRow({
        organization_id: null,
        context: null,
        deploy_url: null,
        deploy_platform: null,
        repo_url: null,
        preview_url: null,
        metadata: null as never,
        current_version: null as never,
        slug: null,
        suggested_slugs: null,
        published_at: null,
      });
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.findById('proj-1');
      expect(result).not.toBeNull();
      expect(result!.organizationId).toBeNull();
      expect(result!.context).toBe('');
      expect(result!.deployUrl).toBeNull();
      expect(result!.deployPlatform).toBeNull();
      expect(result!.repoUrl).toBeNull();
      expect(result!.previewUrl).toBeNull();
      expect(result!.metadata).toEqual({});
      expect(result!.currentVersion).toBe(0);
      expect(result!.slug).toBeNull();
      expect(result!.suggestedSlugs).toBeUndefined();
      expect(result!.publishedAt).toBeNull();
      expect(result!.createdAt).toBe(String(NOW));
    });
  });

  // ─── 에러 전파 ─────────────────────────────────────────────────────────────
  describe('에러 전파', () => {
    it('findByUserId — DB 에러를 그대로 던진다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockRejectedValue(new Error('DB 연결 실패')),
          }),
        }),
      } as never);
      await expect(repo.findByUserId('user-1')).rejects.toThrow('DB 연결 실패');
    });

    it('countTodayGenerations — DB 에러를 그대로 던진다', async () => {
      vi.mocked(mockDb.execute).mockRejectedValue(new Error('쿼리 실패'));
      await expect(repo.countTodayGenerations('user-1')).rejects.toThrow('쿼리 실패');
    });
  });
});
