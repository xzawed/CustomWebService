import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type Database from 'better-sqlite3';
import { createSqliteConnection, runSqliteMigrations, type SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import { SqliteProjectRepository } from './SqliteProjectRepository';
import type { Project } from '@/types/project';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';
const API_ID = '33333333-3333-3333-3333-333333333333';
const API_ID_2 = '44444444-4444-4444-4444-444444444444';

function seedUser(db: SqliteDb, id: string, email: string): void {
  db.insert(schema.users).values({ id, email }).run();
}

function seedApi(db: SqliteDb, id: string, name: string): void {
  db.insert(schema.apiCatalog).values({ id, name }).run();
}

/** 직접 projects 행을 삽입하고 도메인 식별용 id를 반환한다. */
function seedProject(
  db: SqliteDb,
  overrides: Partial<typeof schema.projects.$inferInsert> = {}
): string {
  const [row] = db
    .insert(schema.projects)
    .values({
      user_id: USER_ID,
      name: 'Test Project',
      context: 'a context',
      ...overrides,
    } as typeof schema.projects.$inferInsert)
    .returning()
    .all();
  return row.id;
}

function baseCreateInput(
  overrides: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>> = {}
): Omit<Project, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    userId: USER_ID,
    organizationId: null,
    name: 'My Project',
    context: 'build something',
    status: 'draft',
    deployUrl: null,
    deployPlatform: null,
    repoUrl: null,
    previewUrl: null,
    metadata: {},
    currentVersion: 0,
    apis: [],
    slug: null,
    suggestedSlugs: undefined,
    publishedAt: null,
    ...overrides,
  };
}

describe('SqliteProjectRepository', () => {
  let db: SqliteDb;
  let raw: Database.Database;
  let repo: SqliteProjectRepository;

  beforeEach(() => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    runSqliteMigrations(db);

    seedUser(db, USER_ID, 'owner@example.com');
    seedUser(db, OTHER_USER_ID, 'other@example.com');
    seedApi(db, API_ID, 'API One');
    seedApi(db, API_ID_2, 'API Two');

    repo = new SqliteProjectRepository(db);
  });

  afterEach(() => {
    raw.close();
  });

  describe('create', () => {
    it('creates a project and maps to domain shape', async () => {
      const created = await repo.create(baseCreateInput({ name: 'Hello', context: 'ctx' }));

      expect(created.id).toBeTruthy();
      expect(created.name).toBe('Hello');
      expect(created.context).toBe('ctx');
      expect(created.userId).toBe(USER_ID);
      expect(created.status).toBe('draft');
      // organization_id는 항상 null 보존
      expect(created.organizationId).toBeNull();
      expect(created.apis).toEqual([]);
      expect(created.metadata).toEqual({});
      expect(created.currentVersion).toBe(0);
      expect(created.slug).toBeNull();
      expect(created.publishedAt).toBeNull();
      // 타임스탬프는 ISO 문자열
      expect(typeof created.createdAt).toBe('string');
      expect(typeof created.updatedAt).toBe('string');
      expect(() => new Date(created.createdAt).toISOString()).not.toThrow();
    });

    it('strips apis and persists json metadata + suggestedSlugs round-trip', async () => {
      const created = await repo.create(
        baseCreateInput({
          metadata: { tags: ['x', 'y'], isPublic: true },
          suggestedSlugs: ['a', 'b'],
        })
      );

      const reloaded = await repo.findById(created.id);
      expect(reloaded).not.toBeNull();
      // JSON 컬럼은 객체/배열로 역직렬화되어 돌아옴(JSON.parse 불필요)
      expect(reloaded?.metadata).toEqual({ tags: ['x', 'y'], isPublic: true });
      expect(reloaded?.suggestedSlugs).toEqual(['a', 'b']);
      // apis는 매핑에서 항상 빈 배열
      expect(reloaded?.apis).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns the project when found', async () => {
      const id = seedProject(db, { name: 'FindMe' });
      const found = await repo.findById(id);
      expect(found?.id).toBe(id);
      expect(found?.name).toBe('FindMe');
    });

    it('returns null when not found', async () => {
      const found = await repo.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('returns only the given user projects, newest first', async () => {
      const first = seedProject(db, {
        name: 'First',
        created_at: '2026-01-01T00:00:00.000Z',
      });
      const second = seedProject(db, {
        name: 'Second',
        created_at: '2026-02-01T00:00:00.000Z',
      });
      // 다른 사용자 프로젝트는 제외되어야 함
      seedProject(db, { user_id: OTHER_USER_ID, name: 'Foreign' });

      const list = await repo.findByUserId(USER_ID);
      expect(list).toHaveLength(2);
      // created_at desc → Second 먼저
      expect(list[0].id).toBe(second);
      expect(list[1].id).toBe(first);
      expect(list.every((p) => p.userId === USER_ID)).toBe(true);
    });

    it('returns empty array when user has no projects', async () => {
      const list = await repo.findByUserId(OTHER_USER_ID);
      expect(list).toEqual([]);
    });
  });

  describe('findMany', () => {
    beforeEach(() => {
      seedProject(db, { name: 'P1', status: 'draft', created_at: '2026-01-01T00:00:00.000Z' });
      seedProject(db, { name: 'P2', status: 'published', created_at: '2026-02-01T00:00:00.000Z' });
      seedProject(db, {
        user_id: OTHER_USER_ID,
        name: 'P3',
        status: 'draft',
        created_at: '2026-03-01T00:00:00.000Z',
      });
    });

    it('returns all with total when no filter (desc by created_at)', async () => {
      const { items, total } = await repo.findMany();
      expect(total).toBe(3);
      expect(items).toHaveLength(3);
      expect(items[0].name).toBe('P3'); // newest
    });

    it('applies camelCase filter converted to snake_case column', async () => {
      const { items, total } = await repo.findMany({ userId: USER_ID });
      expect(total).toBe(2);
      expect(items.every((p) => p.userId === USER_ID)).toBe(true);
    });

    it('supports multiple filter conditions', async () => {
      const { items, total } = await repo.findMany({ userId: USER_ID, status: 'published' });
      expect(total).toBe(1);
      expect(items[0].name).toBe('P2');
    });

    it('honors pagination (limit/page)', async () => {
      const pageOne = await repo.findMany(undefined, { page: 1, limit: 2 });
      expect(pageOne.total).toBe(3);
      expect(pageOne.items).toHaveLength(2);

      const pageTwo = await repo.findMany(undefined, { page: 2, limit: 2 });
      expect(pageTwo.total).toBe(3);
      expect(pageTwo.items).toHaveLength(1);
    });

    it('honors ascending order direction', async () => {
      const { items } = await repo.findMany(undefined, { orderDirection: 'asc' });
      expect(items[0].name).toBe('P1'); // oldest first
    });
  });

  describe('update', () => {
    it('updates fields and refreshes updated_at, stripping apis', async () => {
      const id = seedProject(db, { name: 'Before', updated_at: '2020-01-01T00:00:00.000Z' });

      const updated = await repo.update(id, {
        name: 'After',
        status: 'generated',
        apis: [{ id: 'should-be-stripped' } as never],
      });

      expect(updated.name).toBe('After');
      expect(updated.status).toBe('generated');
      expect(updated.apis).toEqual([]);
      // updated_at이 갱신됨
      expect(updated.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date('2020-01-01T00:00:00.000Z').getTime()
      );
    });

    it('throws NotFoundError when project does not exist', async () => {
      await expect(
        repo.update('00000000-0000-0000-0000-000000000000', { name: 'x' })
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    function seedGeneratedCode(projectId: string, version = 1): void {
      db.insert(schema.generatedCodes)
        .values({
          project_id: projectId,
          version,
        } as typeof schema.generatedCodes.$inferInsert)
        .run();
    }

    function seedPlatformEvent(projectId: string, type = 'TEST_EVENT'): string {
      const [row] = db
        .insert(schema.platformEvents)
        .values({
          type,
          payload: { projectId },
          project_id: projectId,
          user_id: USER_ID,
        })
        .returning()
        .all();
      return row.id;
    }

    function seedGenerationLock(projectId: string): void {
      const now = new Date().toISOString();
      db.insert(schema.generationLocks)
        .values({
          project_id: projectId,
          user_id: USER_ID,
          acquired_at: now,
          heartbeat_at: now,
        })
        .run();
    }

    it('프로젝트를 삭제한다', async () => {
      const id = seedProject(db);
      await repo.delete(id);
      const found = await repo.findById(id);
      expect(found).toBeNull();
    });

    // 프로덕션 재현: draft + project_apis 만 있어도 FK 때문에 500이 나던 경로
    it('project_apis 자식이 있어도 삭제에 성공한다', async () => {
      const id = seedProject(db);
      await repo.insertProjectApis(id, [API_ID, API_ID_2]);

      await expect(repo.delete(id)).resolves.toBeUndefined();
      expect(await repo.findById(id)).toBeNull();
      expect(await repo.getProjectApiIds(id)).toEqual([]);
    });

    it('generated_codes 자식이 있어도 삭제에 성공한다', async () => {
      const id = seedProject(db);
      seedGeneratedCode(id, 1);
      seedGeneratedCode(id, 2);

      await expect(repo.delete(id)).resolves.toBeUndefined();
      expect(await repo.findById(id)).toBeNull();
      const remaining = db
        .select()
        .from(schema.generatedCodes)
        .where(eq(schema.generatedCodes.project_id, id))
        .all();
      expect(remaining).toHaveLength(0);
    });

    // 감사 로그 보존 결정: 행 삭제 금지, project_id만 NULL — 회귀 시 감사 유실
    it('platform_events는 남기고 project_id만 NULL로 분리한다', async () => {
      const id = seedProject(db);
      const eventId = seedPlatformEvent(id, 'PROJECT_CREATED');

      await expect(repo.delete(id)).resolves.toBeUndefined();
      expect(await repo.findById(id)).toBeNull();

      const [event] = db
        .select()
        .from(schema.platformEvents)
        .where(eq(schema.platformEvents.id, eventId))
        .all();
      expect(event).toBeDefined();
      expect(event.project_id).toBeNull();
      expect(event.payload).toEqual({ projectId: id });
    });

    it('generation_locks 행도 함께 제거한다', async () => {
      const id = seedProject(db);
      seedGenerationLock(id);

      await expect(repo.delete(id)).resolves.toBeUndefined();
      const locks = db
        .select()
        .from(schema.generationLocks)
        .where(eq(schema.generationLocks.project_id, id))
        .all();
      expect(locks).toHaveLength(0);
    });

    it('모든 자식 종류가 있어도 한 트랜잭션으로 삭제된다', async () => {
      const id = seedProject(db);
      await repo.insertProjectApis(id, [API_ID]);
      seedGeneratedCode(id);
      const eventId = seedPlatformEvent(id);
      seedGenerationLock(id);

      await expect(repo.delete(id)).resolves.toBeUndefined();
      expect(await repo.findById(id)).toBeNull();
      expect(await repo.getProjectApiIds(id)).toEqual([]);
      expect(
        db.select().from(schema.generatedCodes).where(eq(schema.generatedCodes.project_id, id)).all()
      ).toHaveLength(0);
      expect(
        db.select().from(schema.generationLocks).where(eq(schema.generationLocks.project_id, id)).all()
      ).toHaveLength(0);
      const [event] = db
        .select()
        .from(schema.platformEvents)
        .where(eq(schema.platformEvents.id, eventId))
        .all();
      expect(event.project_id).toBeNull();
    });

    // 스코프 버그 방지: WHERE 누락 시 다른 프로젝트 데이터가 같이 지워짐
    it('다른 프로젝트의 자식 행은 건드리지 않는다', async () => {
      const target = seedProject(db, { name: 'Target' });
      const other = seedProject(db, { name: 'Other' });

      await repo.insertProjectApis(target, [API_ID]);
      await repo.insertProjectApis(other, [API_ID_2]);
      seedGeneratedCode(target, 1);
      seedGeneratedCode(other, 1);
      const otherEventId = seedPlatformEvent(other, 'KEEP_ME');
      seedGenerationLock(target);
      seedGenerationLock(other);

      await repo.delete(target);

      expect(await repo.findById(other)).not.toBeNull();
      expect(await repo.getProjectApiIds(other)).toEqual([API_ID_2]);
      expect(
        db
          .select()
          .from(schema.generatedCodes)
          .where(eq(schema.generatedCodes.project_id, other))
          .all()
      ).toHaveLength(1);
      const [otherEvent] = db
        .select()
        .from(schema.platformEvents)
        .where(eq(schema.platformEvents.id, otherEventId))
        .all();
      expect(otherEvent.project_id).toBe(other);
      expect(
        db
          .select()
          .from(schema.generationLocks)
          .where(eq(schema.generationLocks.project_id, other))
          .all()
      ).toHaveLength(1);
    });

    it('존재하지 않는 id는 예외 없이 no-op이다', async () => {
      await expect(
        repo.delete('00000000-0000-0000-0000-000000000000')
      ).resolves.toBeUndefined();
    });
  });

  describe('count', () => {
    beforeEach(() => {
      seedProject(db, { status: 'draft' });
      seedProject(db, { status: 'published' });
      seedProject(db, { user_id: OTHER_USER_ID, status: 'draft' });
    });

    it('counts all when no filter', async () => {
      expect(await repo.count()).toBe(3);
    });

    it('counts with snake_case-converted filter', async () => {
      expect(await repo.count({ userId: USER_ID })).toBe(2);
      expect(await repo.count({ status: 'published' })).toBe(1);
    });
  });

  describe('findBySlug', () => {
    it('returns the project with the matching slug', async () => {
      const id = seedProject(db, { slug: 'my-slug' });
      const found = await repo.findBySlug('my-slug');
      expect(found?.id).toBe(id);
      expect(found?.slug).toBe('my-slug');
    });

    it('returns null when slug not found', async () => {
      const found = await repo.findBySlug('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('updateSlug', () => {
    it('sets slug, published_at, status=published and refreshes updated_at', async () => {
      const id = seedProject(db, { status: 'draft' });
      const publishedAt = new Date('2026-06-22T12:00:00.000Z');

      const result = await repo.updateSlug(id, 'live-slug', publishedAt);

      expect(result.slug).toBe('live-slug');
      expect(result.status).toBe('published');
      expect(result.publishedAt).toBe('2026-06-22T12:00:00.000Z');
      expect(typeof result.updatedAt).toBe('string');

      // 영속성 확인
      const reloaded = await repo.findBySlug('live-slug');
      expect(reloaded?.id).toBe(id);
      expect(reloaded?.status).toBe('published');
    });

    it('throws NotFoundError when project does not exist', async () => {
      await expect(
        repo.updateSlug('00000000-0000-0000-0000-000000000000', 's', new Date())
      ).rejects.toThrow();
    });
  });

  describe('updateSuggestedSlugs', () => {
    it('persists the suggested slugs json array', async () => {
      const id = seedProject(db);
      await repo.updateSuggestedSlugs(id, ['alpha', 'beta', 'gamma']);

      const reloaded = await repo.findById(id);
      expect(reloaded?.suggestedSlugs).toEqual(['alpha', 'beta', 'gamma']);
    });
  });

  describe('insertProjectApis / getProjectApiIds', () => {
    it('inserts mappings and reads them back', async () => {
      const projectId = seedProject(db);
      await repo.insertProjectApis(projectId, [API_ID, API_ID_2]);

      const ids = await repo.getProjectApiIds(projectId);
      expect(ids.sort()).toEqual([API_ID, API_ID_2].sort());
    });

    it('insert is a no-op for empty array', async () => {
      const projectId = seedProject(db);
      await repo.insertProjectApis(projectId, []);
      const ids = await repo.getProjectApiIds(projectId);
      expect(ids).toEqual([]);
    });

    it('getProjectApiIds returns empty array when none', async () => {
      const projectId = seedProject(db);
      const ids = await repo.getProjectApiIds(projectId);
      expect(ids).toEqual([]);
    });
  });

  describe('countTodayGenerations', () => {
    function seedGeneratedCode(
      projectId: string,
      version: number,
      createdAt: string
    ): void {
      db.insert(schema.generatedCodes)
        .values({
          project_id: projectId,
          version,
          created_at: createdAt,
        } as typeof schema.generatedCodes.$inferInsert)
        .run();
    }

    it('counts only generated_codes created today (UTC) for the user', async () => {
      const projectId = seedProject(db, { name: 'GenProj' });

      const now = new Date();
      const todayUtc = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 10, 0, 0)
      ).toISOString();
      const alsoToday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 0)
      ).toISOString();
      const yesterday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 1
      ).toISOString();

      seedGeneratedCode(projectId, 1, todayUtc);
      seedGeneratedCode(projectId, 2, alsoToday);
      seedGeneratedCode(projectId, 3, yesterday); // 어제 → 제외

      const count = await repo.countTodayGenerations(USER_ID);
      expect(count).toBe(2);
    });

    it('does not count other users generations', async () => {
      const ownProject = seedProject(db, { name: 'Own' });
      const foreignProject = seedProject(db, { user_id: OTHER_USER_ID, name: 'Foreign' });

      const now = new Date();
      const todayUtc = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0)
      ).toISOString();

      seedGeneratedCode(ownProject, 1, todayUtc);
      seedGeneratedCode(foreignProject, 1, todayUtc);

      expect(await repo.countTodayGenerations(USER_ID)).toBe(1);
      expect(await repo.countTodayGenerations(OTHER_USER_ID)).toBe(1);
    });

    it('returns 0 when user has no generations', async () => {
      expect(await repo.countTodayGenerations(USER_ID)).toBe(0);
    });
  });
});
