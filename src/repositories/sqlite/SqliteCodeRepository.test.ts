import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createSqliteConnection, runSqliteMigrations, type SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import { SqliteCodeRepository } from './SqliteCodeRepository';
import type { GeneratedCode } from '@/types/project';

type CreateInput = Omit<GeneratedCode, 'id' | 'createdAt' | 'updatedAt'>;

describe('SqliteCodeRepository', () => {
  let db: SqliteDb;
  let raw: Database.Database;
  let repo: SqliteCodeRepository;
  let projectId: string;

  /** FK 선행 행(users 1행, projects 1행)을 시드하고 project id를 반환한다. */
  function seedProject(): { userId: string; projectId: string } {
    const [user] = db
      .insert(schema.users)
      .values({ email: `user-${crypto.randomUUID()}@example.com`, name: 'Tester' })
      .returning()
      .all();

    const [project] = db
      .insert(schema.projects)
      .values({ user_id: user.id, name: 'Test Project' })
      .returning()
      .all();

    return { userId: user.id, projectId: project.id };
  }

  function baseInput(overrides: Partial<CreateInput> = {}): CreateInput {
    return {
      projectId,
      version: 1,
      codeHtml: '<h1>hi</h1>',
      codeCss: 'body{}',
      codeJs: 'console.log(1)',
      framework: 'vanilla',
      aiProvider: 'anthropic',
      aiModel: 'claude-opus-4-7',
      aiPromptUsed: 'prompt',
      generationTimeMs: 1234,
      tokenUsage: { input: 100, output: 200 },
      dependencies: ['tailwind'],
      metadata: { qualityScore: 88, hasResponsive: true },
      ...overrides,
    };
  }

  beforeEach(() => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    runSqliteMigrations(db);
    repo = new SqliteCodeRepository(db);
    const seeded = seedProject();
    projectId = seeded.projectId;
  });

  afterEach(() => {
    raw.close();
  });

  describe('findMetadataByDateRange', () => {
    function insertCode(version: number, createdAt: string, metadata: Record<string, unknown>): void {
      raw
        .prepare(
          'INSERT INTO generated_codes (id, project_id, version, metadata, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(crypto.randomUUID(), projectId, version, JSON.stringify(metadata), createdAt);
    }

    it('from(포함) 이후 코드의 metadata를 created_at desc로 반환한다', async () => {
      insertCode(1, '2026-06-10T00:00:00.000Z', { structuralScore: 80 });
      insertCode(2, '2026-06-20T00:00:00.000Z', { structuralScore: 90 });
      insertCode(3, '2026-05-01T00:00:00.000Z', { structuralScore: 50 }); // 윈도우 이전

      const result = await repo.findMetadataByDateRange(new Date('2026-06-01T00:00:00.000Z'));

      expect(result).toHaveLength(2);
      // desc 정렬 → 최신(06-20)이 먼저
      expect((result[0].metadata as { structuralScore?: number }).structuralScore).toBe(90);
      expect(result[0].createdAt).toBe('2026-06-20T00:00:00.000Z');
      expect((result[1].metadata as { structuralScore?: number }).structuralScore).toBe(80);
    });
  });

  describe('create', () => {
    it('새 생성 코드를 만들고 도메인 shape로 반환한다 (JSON/타임스탬프 매핑)', async () => {
      const created = await repo.create(baseInput());

      expect(created.id).toBeTruthy();
      expect(created.projectId).toBe(projectId);
      expect(created.version).toBe(1);
      expect(created.codeHtml).toBe('<h1>hi</h1>');
      expect(created.codeCss).toBe('body{}');
      expect(created.codeJs).toBe('console.log(1)');
      expect(created.framework).toBe('vanilla');
      expect(created.aiProvider).toBe('anthropic');
      expect(created.aiModel).toBe('claude-opus-4-7');
      expect(created.aiPromptUsed).toBe('prompt');
      expect(created.generationTimeMs).toBe(1234);
      // JSON 컬럼은 객체/배열로 역직렬화되어야 한다 (JSON.parse 불필요)
      expect(created.tokenUsage).toEqual({ input: 100, output: 200 });
      expect(created.dependencies).toEqual(['tailwind']);
      expect(created.metadata).toEqual({ qualityScore: 88, hasResponsive: true });
      // 타임스탬프는 ISO 문자열
      expect(typeof created.createdAt).toBe('string');
      expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
    });

    it('null/빈 필드를 기본값으로 매핑한다', async () => {
      const created = await repo.create(
        baseInput({
          codeCss: '',
          codeJs: '',
          aiProvider: null,
          aiModel: null,
          aiPromptUsed: null,
          generationTimeMs: null,
          tokenUsage: null,
          dependencies: [],
          metadata: {},
        }),
      );

      expect(created.aiProvider).toBeNull();
      expect(created.aiModel).toBeNull();
      expect(created.aiPromptUsed).toBeNull();
      expect(created.generationTimeMs).toBeNull();
      expect(created.tokenUsage).toBeNull();
      expect(created.dependencies).toEqual([]);
      expect(created.metadata).toEqual({});
    });

    it('(project_id, version) UNIQUE 제약을 강제한다', async () => {
      await repo.create(baseInput({ version: 1 }));
      await expect(repo.create(baseInput({ version: 1 }))).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('존재하는 행을 조회한다', async () => {
      const created = await repo.create(baseInput());
      const found = await repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    it('없으면 null을 반환한다', async () => {
      const found = await repo.findById(crypto.randomUUID());
      expect(found).toBeNull();
    });
  });

  describe('findMany', () => {
    it('필터·페이지네이션·정렬(created_at desc 기본)을 적용한다', async () => {
      await repo.create(baseInput({ version: 1 }));
      await repo.create(baseInput({ version: 2 }));
      await repo.create(baseInput({ version: 3 }));

      const result = await repo.findMany({ projectId });
      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(3);
      expect(result.items.every((i) => i.projectId === projectId)).toBe(true);
    });

    it('limit/page로 페이지를 자른다', async () => {
      for (let v = 1; v <= 5; v++) {
        await repo.create(baseInput({ version: v }));
      }
      const page1 = await repo.findMany({ projectId }, { page: 1, limit: 2 });
      expect(page1.total).toBe(5);
      expect(page1.items).toHaveLength(2);

      const page3 = await repo.findMany({ projectId }, { page: 3, limit: 2 });
      expect(page3.items).toHaveLength(1);
    });

    it('필터 없으면 빈 결과', async () => {
      const result = await repo.findMany({ projectId });
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  describe('update', () => {
    it('필드를 갱신하고 갱신된 도메인을 반환한다', async () => {
      const created = await repo.create(baseInput());
      const updated = await repo.update(created.id, {
        codeHtml: '<h2>updated</h2>',
        metadata: { qualityScore: 99 },
      });
      expect(updated.id).toBe(created.id);
      expect(updated.codeHtml).toBe('<h2>updated</h2>');
      expect(updated.metadata).toEqual({ qualityScore: 99 });
      // 변경하지 않은 필드는 유지
      expect(updated.version).toBe(1);
    });
  });

  describe('delete', () => {
    it('행을 삭제한다', async () => {
      const created = await repo.create(baseInput());
      await repo.delete(created.id);
      expect(await repo.findById(created.id)).toBeNull();
    });

    it('없는 id 삭제는 조용히 통과한다', async () => {
      await expect(repo.delete(crypto.randomUUID())).resolves.toBeUndefined();
    });
  });

  describe('count', () => {
    it('필터에 맞는 행 수를 센다', async () => {
      await repo.create(baseInput({ version: 1 }));
      await repo.create(baseInput({ version: 2 }));
      expect(await repo.count({ projectId })).toBe(2);
      expect(await repo.count()).toBe(2);
      expect(await repo.count({ projectId: crypto.randomUUID() })).toBe(0);
    });
  });

  describe('findByProject', () => {
    it('version 미지정 시 최신 버전을 반환한다', async () => {
      await repo.create(baseInput({ version: 1 }));
      await repo.create(baseInput({ version: 3 }));
      await repo.create(baseInput({ version: 2 }));

      const latest = await repo.findByProject(projectId);
      expect(latest?.version).toBe(3);
    });

    it('version 지정 시 해당 버전을 반환한다', async () => {
      await repo.create(baseInput({ version: 1 }));
      await repo.create(baseInput({ version: 2 }));

      const v1 = await repo.findByProject(projectId, 1);
      expect(v1?.version).toBe(1);
    });

    it('없으면 null', async () => {
      expect(await repo.findByProject(projectId)).toBeNull();
      expect(await repo.findByProject(projectId, 99)).toBeNull();
      expect(await repo.findByProject(crypto.randomUUID())).toBeNull();
    });
  });

  describe('findAllByProject', () => {
    it('모든 버전을 version 오름차순으로 반환한다', async () => {
      await repo.create(baseInput({ version: 2, codeHtml: 'v2' }));
      await repo.create(baseInput({ version: 1, codeHtml: 'v1' }));
      await repo.create(baseInput({ version: 3, codeHtml: 'v3' }));

      const all = await repo.findAllByProject(projectId);
      expect(all.map((c) => c.version)).toEqual([1, 2, 3]);
      expect(all.map((c) => c.codeHtml)).toEqual(['v1', 'v2', 'v3']);
    });

    it('없으면 빈 배열', async () => {
      expect(await repo.findAllByProject(projectId)).toEqual([]);
      expect(await repo.findAllByProject(crypto.randomUUID())).toEqual([]);
    });
  });

  describe('countByProject', () => {
    it('프로젝트별 행 수를 센다', async () => {
      await repo.create(baseInput({ version: 1 }));
      await repo.create(baseInput({ version: 2 }));
      expect(await repo.countByProject(projectId)).toBe(2);
    });

    it('행이 없으면 0', async () => {
      expect(await repo.countByProject(projectId)).toBe(0);
      expect(await repo.countByProject(crypto.randomUUID())).toBe(0);
    });
  });

  describe('getNextVersion', () => {
    it('행이 없으면 1을 반환한다', async () => {
      expect(await repo.getNextVersion(projectId)).toBe(1);
    });

    it('MAX(version)+1을 반환한다', async () => {
      await repo.create(baseInput({ version: 1 }));
      await repo.create(baseInput({ version: 5 }));
      await repo.create(baseInput({ version: 3 }));
      expect(await repo.getNextVersion(projectId)).toBe(6);
    });

    it('다른 프로젝트의 버전에 영향받지 않는다', async () => {
      await repo.create(baseInput({ version: 7 }));
      const other = seedProject();
      expect(await repo.getNextVersion(other.projectId)).toBe(1);
    });
  });

  describe('pruneOldVersions', () => {
    it('최신 keepCount개만 남기고 오래된 버전을 삭제한다', async () => {
      for (let v = 1; v <= 5; v++) {
        await repo.create(baseInput({ version: v }));
      }

      await repo.pruneOldVersions(projectId, 2);

      const remaining = await repo.findMany({ projectId }, { limit: 100 });
      const versions = remaining.items.map((i) => i.version).sort((a, b) => a - b);
      // 최신 2개(4,5)만 유지
      expect(versions).toEqual([4, 5]);
    });

    it('keepCount 이하면 아무것도 삭제하지 않는다', async () => {
      await repo.create(baseInput({ version: 1 }));
      await repo.create(baseInput({ version: 2 }));

      await repo.pruneOldVersions(projectId, 5);

      expect(await repo.countByProject(projectId)).toBe(2);
    });

    it('행이 없으면 조용히 통과한다', async () => {
      await expect(repo.pruneOldVersions(projectId, 3)).resolves.toBeUndefined();
    });

    it('다른 프로젝트 버전은 건드리지 않는다', async () => {
      for (let v = 1; v <= 3; v++) {
        await repo.create(baseInput({ version: v }));
      }
      const other = seedProject();
      const otherRepo = new SqliteCodeRepository(db);
      const prevProject = projectId;
      projectId = other.projectId;
      await otherRepo.create(baseInput({ version: 1 }));
      await otherRepo.create(baseInput({ version: 2 }));
      projectId = prevProject;

      await repo.pruneOldVersions(prevProject, 1);

      expect(await repo.countByProject(prevProject)).toBe(1);
      expect(await repo.countByProject(other.projectId)).toBe(2);
    });
  });
});
