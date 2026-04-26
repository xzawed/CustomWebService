import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ProjectRepository } from './projectRepository';
import type { Project } from '@/types/project';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Chain that resolves via .order() — used for findByUserId */
function makeOrderChain(result: { data: unknown[]; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  };
}

/** Chain that resolves via .single() — used for findBySlug, updateSlug */
function makeSingleChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

/** Chain that resolves via .eq() — used for getProjectApiIds */
function makeEqChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(result),
  };
}

// Typical DB row for a Project
const dbRow = {
  id: 'proj-1',
  user_id: 'user-1',
  organization_id: null,
  name: 'My Project',
  context: 'ctx',
  status: 'draft',
  deploy_url: null,
  deploy_platform: null,
  repo_url: null,
  preview_url: null,
  metadata: {},
  current_version: 1,
  slug: null,
  suggested_slugs: undefined,
  published_at: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

const expectedProject: Project = {
  id: 'proj-1',
  userId: 'user-1',
  organizationId: null,
  name: 'My Project',
  context: 'ctx',
  status: 'draft',
  deployUrl: null,
  deployPlatform: null,
  repoUrl: null,
  previewUrl: null,
  metadata: {},
  currentVersion: 1,
  apis: [],
  slug: null,
  suggestedSlugs: undefined,
  publishedAt: null,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectRepository', () => {
  // ---------- findByUserId ----------

  describe('findByUserId()', () => {
    it('select(*).eq(user_id).order(created_at)를 호출하고 Project 배열을 반환한다', async () => {
      const chain = makeOrderChain({ data: [dbRow], error: null });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      const result = await repo.findByUserId('user-1');

      expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('projects');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expectedProject);
    });

    it('결과가 없으면 빈 배열을 반환한다', async () => {
      const chain = makeOrderChain({ data: [], error: null });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      const result = await repo.findByUserId('user-1');
      expect(result).toEqual([]);
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '42P01', message: 'table not found' };
      const chain = makeOrderChain({ data: [], error: dbError });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      await expect(repo.findByUserId('user-1')).rejects.toEqual(dbError);
    });
  });

  // ---------- countTodayGenerations ----------

  describe('countTodayGenerations()', () => {
    it('rpc("count_today_generations", { p_user_id })를 호출하고 숫자를 반환한다', async () => {
      const supabase = {
        from: vi.fn(),
        rpc: vi.fn().mockResolvedValue({ data: 5, error: null }),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      const result = await repo.countTodayGenerations('u1');

      expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
        'count_today_generations',
        { p_user_id: 'u1' },
      );
      expect(result).toBe(5);
    });

    it('data가 null이면 0을 반환한다', async () => {
      const supabase = {
        from: vi.fn(),
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      const result = await repo.countTodayGenerations('u1');
      expect(result).toBe(0);
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: 'PGRST200', message: 'rpc error' };
      const supabase = {
        from: vi.fn(),
        rpc: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      await expect(repo.countTodayGenerations('u1')).rejects.toEqual(dbError);
    });
  });

  // ---------- insertProjectApis ----------

  describe('insertProjectApis()', () => {
    it('project_apis 테이블에 올바른 매핑 배열로 insert를 호출한다', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      const projectApisChain = { insert: insertMock };
      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'project_apis') return projectApisChain;
          return {};
        }),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      await repo.insertProjectApis('proj1', ['api1', 'api2']);

      expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('project_apis');
      expect(insertMock).toHaveBeenCalledWith([
        { project_id: 'proj1', api_id: 'api1' },
        { project_id: 'proj1', api_id: 'api2' },
      ]);
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '23503', message: 'foreign key violation' };
      const insertMock = vi.fn().mockResolvedValue({ error: dbError });
      const projectApisChain = { insert: insertMock };
      const supabase = {
        from: vi.fn().mockReturnValue(projectApisChain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      await expect(repo.insertProjectApis('proj1', ['api1'])).rejects.toEqual(dbError);
    });
  });

  // ---------- getProjectApiIds ----------

  describe('getProjectApiIds()', () => {
    it('project_apis 테이블에서 api_id 배열을 반환한다', async () => {
      const rows = [{ api_id: 'api1' }, { api_id: 'api2' }];
      const chain = makeEqChain({ data: rows, error: null });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      const result = await repo.getProjectApiIds('proj1');

      expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('project_apis');
      expect(chain.select).toHaveBeenCalledWith('api_id');
      expect(chain.eq).toHaveBeenCalledWith('project_id', 'proj1');
      expect(result).toEqual(['api1', 'api2']);
    });

    it('결과가 없으면 빈 배열을 반환한다', async () => {
      const chain = makeEqChain({ data: null, error: null });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      const result = await repo.getProjectApiIds('proj1');
      expect(result).toEqual([]);
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '42P01', message: 'table not found' };
      const chain = makeEqChain({ data: null, error: dbError });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      await expect(repo.getProjectApiIds('proj1')).rejects.toEqual(dbError);
    });
  });

  // ---------- findBySlug ----------

  describe('findBySlug()', () => {
    it('select(*).eq(slug).single()을 호출하고 Project를 반환한다', async () => {
      const slugRow = { ...dbRow, slug: 'my-slug', status: 'published' };
      const chain = makeSingleChain({ data: slugRow, error: null });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      const result = await repo.findBySlug('my-slug');

      expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('projects');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.eq).toHaveBeenCalledWith('slug', 'my-slug');
      expect(chain.single).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result?.slug).toBe('my-slug');
    });

    it('PGRST116 에러면 null을 반환한다', async () => {
      const chain = makeSingleChain({
        data: null,
        error: { code: 'PGRST116', message: 'Row not found' },
      });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      const result = await repo.findBySlug('nonexistent');
      expect(result).toBeNull();
    });

    it('data가 null이면 null을 반환한다', async () => {
      const chain = makeSingleChain({ data: null, error: null });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      const result = await repo.findBySlug('my-slug');
      expect(result).toBeNull();
    });

    it('PGRST116 이외 에러는 throw한다', async () => {
      const dbError = { code: '42P01', message: 'table not found' };
      const chain = makeSingleChain({ data: null, error: dbError });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      await expect(repo.findBySlug('my-slug')).rejects.toEqual(dbError);
    });
  });

  // ---------- updateSuggestedSlugs ----------

  describe('updateSuggestedSlugs()', () => {
    it('projects 테이블에 suggested_slugs로 update().eq()를 호출한다', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      const projectsChain = { update: updateMock };
      const supabase = {
        from: vi.fn().mockReturnValue(projectsChain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      await repo.updateSuggestedSlugs('proj-1', ['slug-a', 'slug-b']);

      expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('projects');
      expect(updateMock).toHaveBeenCalledWith({ suggested_slugs: ['slug-a', 'slug-b'] });
      expect(eqMock).toHaveBeenCalledWith('id', 'proj-1');
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '42P01', message: 'table not found' };
      const eqMock = vi.fn().mockResolvedValue({ error: dbError });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      const projectsChain = { update: updateMock };
      const supabase = {
        from: vi.fn().mockReturnValue(projectsChain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      await expect(repo.updateSuggestedSlugs('proj-1', ['slug-a'])).rejects.toEqual(dbError);
    });
  });

  // ---------- updateSlug ----------

  describe('updateSlug()', () => {
    it('update({ slug, published_at, status:"published", updated_at }).eq(id).select().single()을 호출하고 Project를 반환한다', async () => {
      const publishedRow = {
        ...dbRow,
        slug: 'new-slug',
        status: 'published',
        published_at: '2024-06-01T00:00:00.000Z',
      };
      const chain = makeSingleChain({ data: publishedRow, error: null });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);
      const publishedAt = new Date('2024-06-01T00:00:00.000Z');

      const result = await repo.updateSlug('proj-1', 'new-slug', publishedAt);

      expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('projects');
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'new-slug',
          published_at: publishedAt.toISOString(),
          status: 'published',
          updated_at: expect.any(String),
        }),
      );
      expect(chain.eq).toHaveBeenCalledWith('id', 'proj-1');
      expect(chain.select).toHaveBeenCalled();
      expect(chain.single).toHaveBeenCalled();
      expect(result.status).toBe('published');
      expect(result.slug).toBe('new-slug');
    });

    it('에러 발생 시 throw한다', async () => {
      const dbError = { code: '42P01', message: 'table not found' };
      const chain = makeSingleChain({ data: null, error: dbError });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      await expect(
        repo.updateSlug('proj-1', 'new-slug', new Date()),
      ).rejects.toEqual(dbError);
    });
  });

  // ---------- toDomain mapping ----------

  describe('toDomain() mapping', () => {
    it('모든 nullable 필드의 기본값이 올바르게 매핑된다', async () => {
      const chain = makeSingleChain({ data: dbRow, error: null });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      const result = await repo.findBySlug('any');
      expect(result).toEqual(expectedProject);
      expect(result?.apis).toEqual([]);
      expect(result?.organizationId).toBeNull();
      expect(result?.deployUrl).toBeNull();
      expect(result?.slug).toBeNull();
      expect(result?.publishedAt).toBeNull();
    });

    it('currentVersion이 없으면 0으로 기본값이 설정된다', async () => {
      const rowNoVersion = { ...dbRow, current_version: null };
      const chain = makeSingleChain({ data: rowNoVersion, error: null });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      const result = await repo.findBySlug('any');
      expect(result?.currentVersion).toBe(0);
    });

    it('metadata가 없으면 빈 객체 {}로 기본값이 설정된다', async () => {
      const rowNoMeta = { ...dbRow, metadata: null };
      const chain = makeSingleChain({ data: rowNoMeta, error: null });
      const supabase = {
        from: vi.fn().mockReturnValue(chain),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const repo = new ProjectRepository(supabase);

      const result = await repo.findBySlug('any');
      expect(result?.metadata).toEqual({});
    });
  });
});
