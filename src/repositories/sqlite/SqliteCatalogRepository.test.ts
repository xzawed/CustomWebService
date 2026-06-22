import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createSqliteConnection, runSqliteMigrations, type SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import { SqliteCatalogRepository } from './SqliteCatalogRepository';
import type { ApiCatalogItem } from '@/types/api';

/**
 * SqliteCatalogRepository 단위 테스트 (:memory: 격리).
 * 각 테스트마다 새 in-memory DB를 만들고 마이그레이션을 적용한다.
 * 매핑 기준은 Supabase 레포(catalogRepository.ts)와 일치해야 한다.
 */

let db: SqliteDb;
let raw: Database.Database;
let repo: SqliteCatalogRepository;

/** 카탈로그 1행 시드 헬퍼 — 필요한 필드만 override. */
function seedCatalog(overrides: Partial<typeof schema.apiCatalog.$inferInsert> = {}): string {
  const id = (overrides.id as string) ?? crypto.randomUUID();
  db
    .insert(schema.apiCatalog)
    .values({
      id,
      name: 'Test API',
      description: 'A test API',
      category: 'data',
      base_url: 'https://api.example.com',
      auth_type: 'none',
      auth_config: {},
      is_active: true,
      endpoints: [],
      tags: [],
      ...overrides,
    })
    .run();
  return id;
}

function seedUser(email = 'admin@example.com'): string {
  const id = crypto.randomUUID();
  db.insert(schema.users).values({ id, email }).run();
  return id;
}

function seedProject(userId: string, overrides: Partial<typeof schema.projects.$inferInsert> = {}): string {
  const id = (overrides.id as string) ?? crypto.randomUUID();
  db
    .insert(schema.projects)
    .values({
      id,
      user_id: userId,
      name: 'Test Project',
      context: 'a weather dashboard',
      status: 'draft',
      ...overrides,
    })
    .run();
  return id;
}

beforeEach(() => {
  const conn = createSqliteConnection(':memory:');
  db = conn.db;
  raw = conn.raw;
  runSqliteMigrations(db);
  repo = new SqliteCatalogRepository(db);
});

afterEach(() => {
  raw.close();
});

describe('SqliteCatalogRepository — findById', () => {
  it('returns the mapped domain item when present', async () => {
    const id = seedCatalog({
      name: 'Weather API',
      category: 'weather',
      auth_type: 'api_key',
      auth_config: { header: 'X-Api-Key' },
      rate_limit: '60/min',
      tags: ['weather', 'forecast'],
      cors_supported: false,
      requires_proxy: true,
      credit_required: 5,
      cache_ttl_seconds: 300,
      verification_status: 'verified',
      verified_at: '2026-06-01T00:00:00.000Z',
      last_verification_note: 'looks good',
    });

    const item = await repo.findById(id);
    expect(item).not.toBeNull();
    expect(item!.id).toBe(id);
    expect(item!.name).toBe('Weather API');
    expect(item!.category).toBe('weather');
    expect(item!.authType).toBe('api_key');
    expect(item!.authConfig).toEqual({ header: 'X-Api-Key' });
    expect(item!.rateLimit).toBe('60/min');
    expect(item!.tags).toEqual(['weather', 'forecast']);
    expect(item!.corsSupported).toBe(false);
    expect(item!.requiresProxy).toBe(true);
    expect(item!.creditRequired).toBe(5);
    expect(item!.cacheTtlSeconds).toBe(300);
    expect(item!.verificationStatus).toBe('verified');
    expect(item!.verifiedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(item!.lastVerificationNote).toBe('looks good');
    expect(typeof item!.createdAt).toBe('string');
    expect(typeof item!.updatedAt).toBe('string');
  });

  it('returns null when not found', async () => {
    const item = await repo.findById(crypto.randomUUID());
    expect(item).toBeNull();
  });

  it('defaults verificationStatus to "unverified" when column is at default', async () => {
    const id = seedCatalog();
    const item = await repo.findById(id);
    expect(item!.verificationStatus).toBe('unverified');
    expect(item!.verifiedAt).toBeNull();
    expect(item!.lastVerificationNote).toBeNull();
  });

  it('parses endpoints with snake_case JSONB field names (example_call/response_example)', async () => {
    const id = seedCatalog({
      endpoints: [
        {
          path: '/forecast',
          method: 'GET',
          description: 'get forecast',
          parameters: { city: 'string' },
          response_example: { temp: 20 },
          example_call: "fetch('/forecast')",
          response_data_path: 'data.items',
          request_headers: { 'X-Foo': 'bar' },
        },
      ],
    });

    const item = await repo.findById(id);
    const ep = item!.endpoints[0];
    expect(ep.path).toBe('/forecast');
    expect(ep.exampleCall).toBe("fetch('/forecast')");
    expect(ep.responseDataPath).toBe('data.items');
    expect(ep.requestHeaders).toEqual({ 'X-Foo': 'bar' });
    expect(ep.responseExample).toEqual({ temp: 20 });
    // parameters object → params array
    expect(ep.params).toEqual([{ name: 'city', type: 'string', required: false, description: '' }]);
  });

  it('parses endpoints with camelCase field names (exampleCall/responseExample)', async () => {
    const id = seedCatalog({
      endpoints: [
        {
          path: '/x',
          method: 'POST',
          description: 'd',
          params: [{ name: 'q', type: 'string', required: true, description: 'query' }],
          responseExample: { ok: true },
          exampleCall: 'call()',
          responseDataPath: 'items',
          requestHeaders: { A: 'B' },
        },
      ],
    });

    const item = await repo.findById(id);
    const ep = item!.endpoints[0];
    expect(ep.method).toBe('POST');
    expect(ep.exampleCall).toBe('call()');
    expect(ep.responseDataPath).toBe('items');
    expect(ep.requestHeaders).toEqual({ A: 'B' });
    expect(ep.params).toEqual([{ name: 'q', type: 'string', required: true, description: 'query' }]);
  });
});

describe('SqliteCatalogRepository — create / update / delete', () => {
  it('creates an item and returns the mapped domain shape', async () => {
    const input: Omit<ApiCatalogItem, 'id' | 'createdAt' | 'updatedAt'> = {
      name: 'New API',
      description: 'desc',
      category: 'news',
      baseUrl: 'https://news.example.com',
      authType: 'none',
      authConfig: { k: 'v' },
      rateLimit: null,
      isActive: true,
      iconUrl: null,
      docsUrl: null,
      endpoints: [],
      tags: ['n'],
      apiVersion: null,
      deprecatedAt: null,
      successorId: null,
      corsSupported: true,
      requiresProxy: false,
      creditRequired: null,
      cacheTtlSeconds: null,
      verificationStatus: 'unverified',
      verifiedAt: null,
      lastVerificationNote: null,
    };

    const created = await repo.create(input);
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('New API');
    expect(created.category).toBe('news');
    expect(created.authConfig).toEqual({ k: 'v' });
    expect(created.tags).toEqual(['n']);
    expect(typeof created.createdAt).toBe('string');

    const fetched = await repo.findById(created.id);
    expect(fetched!.name).toBe('New API');
  });

  it('updates an existing item and bumps updated_at', async () => {
    const id = seedCatalog({ name: 'Old', updated_at: '2020-01-01T00:00:00.000Z' });
    const updated = await repo.update(id, { name: 'Updated', category: 'finance' });
    expect(updated.name).toBe('Updated');
    expect(updated.category).toBe('finance');
    expect(updated.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('deletes an item', async () => {
    const id = seedCatalog();
    await repo.delete(id);
    expect(await repo.findById(id)).toBeNull();
  });
});

describe('SqliteCatalogRepository — findMany / count', () => {
  it('returns items and total with default ordering', async () => {
    seedCatalog({ name: 'A' });
    seedCatalog({ name: 'B' });
    seedCatalog({ name: 'C' });

    const result = await repo.findMany();
    expect(result.total).toBe(3);
    expect(result.items.length).toBe(3);
  });

  it('applies camelCase filter keys mapped to snake_case columns', async () => {
    seedCatalog({ name: 'active1', is_active: true });
    seedCatalog({ name: 'inactive1', is_active: false });

    const result = await repo.findMany({ isActive: true });
    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe('active1');
  });

  it('paginates via page/limit', async () => {
    for (let i = 0; i < 5; i++) seedCatalog({ name: `n${i}` });
    const page1 = await repo.findMany(undefined, { page: 1, limit: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.total).toBe(5);
    const page3 = await repo.findMany(undefined, { page: 3, limit: 2 });
    expect(page3.items.length).toBe(1);
  });

  it('count respects filter', async () => {
    seedCatalog({ category: 'weather' });
    seedCatalog({ category: 'weather' });
    seedCatalog({ category: 'news' });

    expect(await repo.count()).toBe(3);
    expect(await repo.count({ category: 'weather' })).toBe(2);
  });

  it('count returns 0 on empty table', async () => {
    expect(await repo.count()).toBe(0);
  });
});

describe('SqliteCatalogRepository — search', () => {
  beforeEach(() => {
    seedCatalog({ name: 'Weather Forecast', description: 'predicts weather', category: 'weather', is_active: true });
    seedCatalog({ name: 'News Reader', description: 'reads news', category: 'news', is_active: true });
    seedCatalog({ name: 'Hidden API', description: 'inactive', category: 'data', is_active: false });
    seedCatalog({
      name: 'Deprecated API',
      description: 'old',
      category: 'data',
      is_active: true,
      deprecated_at: '2025-01-01T00:00:00.000Z',
    });
  });

  it('returns only active, non-deprecated items by default', async () => {
    const { items, total } = await repo.search({});
    const names = items.map((i) => i.name).sort();
    expect(total).toBe(2);
    expect(names).toEqual(['News Reader', 'Weather Forecast']);
  });

  it('orders results by name ascending', async () => {
    const { items } = await repo.search({});
    expect(items.map((i) => i.name)).toEqual(['News Reader', 'Weather Forecast']);
  });

  it('filters by category', async () => {
    const { items, total } = await repo.search({ category: 'weather' });
    expect(total).toBe(1);
    expect(items[0].name).toBe('Weather Forecast');
  });

  it('treats category "all" as no category filter', async () => {
    const { total } = await repo.search({ category: 'all' });
    expect(total).toBe(2);
  });

  it('searches name and description case-insensitively (mirrors ilike)', async () => {
    const byName = await repo.search({ search: 'weather' });
    expect(byName.total).toBe(1);
    expect(byName.items[0].name).toBe('Weather Forecast');

    const byDesc = await repo.search({ search: 'NEWS' });
    expect(byDesc.total).toBe(1);
    expect(byDesc.items[0].name).toBe('News Reader');
  });

  it('returns empty when search matches nothing', async () => {
    const { items, total } = await repo.search({ search: 'zzznomatch' });
    expect(total).toBe(0);
    expect(items).toEqual([]);
  });

  it('escapes LIKE wildcards so they match literally', async () => {
    seedCatalog({ name: '100% Coverage', description: 'literal percent', is_active: true });
    // '%' is escaped → matches the literal "100%" token, not a wildcard
    const { total, items } = await repo.search({ search: '100%' });
    expect(total).toBe(1);
    expect(items[0].name).toBe('100% Coverage');
  });

  it('paginates with bounded page/limit', async () => {
    // 2 active items, limit 1 → 2 pages
    const page1 = await repo.search({ page: 1, limit: 1 });
    expect(page1.items.length).toBe(1);
    expect(page1.total).toBe(2);
    const page2 = await repo.search({ page: 2, limit: 1 });
    expect(page2.items.length).toBe(1);
    expect(page2.items[0].name).not.toBe(page1.items[0].name);
  });
});

describe('SqliteCatalogRepository — getCategories', () => {
  it('aggregates active non-deprecated categories with labels and icons', async () => {
    seedCatalog({ category: 'weather', is_active: true });
    seedCatalog({ category: 'weather', is_active: true });
    seedCatalog({ category: 'news', is_active: true });
    seedCatalog({ category: 'data', is_active: false }); // excluded (inactive)
    seedCatalog({ category: 'finance', is_active: true, deprecated_at: '2025-01-01T00:00:00.000Z' }); // excluded

    const cats = await repo.getCategories();
    const byKey = new Map(cats.map((c) => [c.key, c]));

    expect(byKey.get('weather')).toEqual({ key: 'weather', label: '날씨/환경', icon: 'Cloud', count: 2 });
    expect(byKey.get('news')).toEqual({ key: 'news', label: '뉴스', icon: 'Newspaper', count: 1 });
    expect(byKey.has('data')).toBe(false);
    expect(byKey.has('finance')).toBe(false);
  });

  it('falls back to key + "Box" for unknown categories', async () => {
    seedCatalog({ category: 'quantum', is_active: true });
    const cats = await repo.getCategories();
    const c = cats.find((x) => x.key === 'quantum');
    expect(c).toEqual({ key: 'quantum', label: 'quantum', icon: 'Box', count: 1 });
  });

  it('returns empty array when no active catalog rows', async () => {
    expect(await repo.getCategories()).toEqual([]);
  });
});

describe('SqliteCatalogRepository — findByIds', () => {
  it('returns matching items', async () => {
    const id1 = seedCatalog({ name: 'One' });
    const id2 = seedCatalog({ name: 'Two' });
    seedCatalog({ name: 'Three' });

    const items = await repo.findByIds([id1, id2]);
    expect(items.map((i) => i.name).sort()).toEqual(['One', 'Two']);
  });

  it('returns empty array for empty input', async () => {
    expect(await repo.findByIds([])).toEqual([]);
  });

  it('returns empty array when no ids match', async () => {
    seedCatalog();
    expect(await repo.findByIds([crypto.randomUUID()])).toEqual([]);
  });
});

describe('SqliteCatalogRepository — getApiUsageFromProjects', () => {
  it('returns api_id + project context for matching project statuses', async () => {
    const userId = seedUser();
    const apiId = seedCatalog();
    const projectId = seedProject(userId, { status: 'published', context: 'weather dashboard' });

    db.insert(schema.projectApis).values({ project_id: projectId, api_id: apiId, config: {} }).run();

    const usage = await repo.getApiUsageFromProjects(['published']);
    expect(usage).toEqual([{ apiId, context: 'weather dashboard' }]);
  });

  it('excludes projects whose status is not requested', async () => {
    const userId = seedUser();
    const apiId = seedCatalog();
    const draftProject = seedProject(userId, { status: 'draft', context: 'x' });
    db.insert(schema.projectApis).values({ project_id: draftProject, api_id: apiId, config: {} }).run();

    const usage = await repo.getApiUsageFromProjects(['published']);
    expect(usage).toEqual([]);
  });

  it('defaults missing context to empty string', async () => {
    const userId = seedUser();
    const apiId = seedCatalog();
    const projectId = seedProject(userId, { status: 'generated', context: null });
    db.insert(schema.projectApis).values({ project_id: projectId, api_id: apiId, config: {} }).run();

    const usage = await repo.getApiUsageFromProjects(['generated']);
    expect(usage).toEqual([{ apiId, context: '' }]);
  });

  it('returns empty array for empty status list', async () => {
    expect(await repo.getApiUsageFromProjects([])).toEqual([]);
  });
});

describe('SqliteCatalogRepository — getActiveNameToIdMap', () => {
  it('maps lowercased name → id for active catalog only', async () => {
    const id1 = seedCatalog({ name: 'OpenWeather', is_active: true });
    seedCatalog({ name: 'InactiveOne', is_active: false });

    const map = await repo.getActiveNameToIdMap();
    expect(map.get('openweather')).toBe(id1);
    expect(map.has('inactiveone')).toBe(false);
    expect(map.size).toBe(1);
  });

  it('returns empty map when nothing active', async () => {
    seedCatalog({ is_active: false });
    const map = await repo.getActiveNameToIdMap();
    expect(map.size).toBe(0);
  });
});

describe('SqliteCatalogRepository — ping', () => {
  it('returns true when the table is queryable', async () => {
    expect(await repo.ping()).toBe(true);
  });
});

describe('SqliteCatalogRepository — getUsageCounts', () => {
  it('counts today generations (>= sinceDate), total projects and users', async () => {
    const userId = seedUser('a@example.com');
    seedUser('b@example.com');
    const apiId = seedCatalog();
    const projectId = seedProject(userId);

    // one generation today, one before sinceDate
    db
      .insert(schema.generatedCodes)
      .values({ project_id: projectId, version: 1, created_at: '2026-06-22T12:00:00.000Z' })
      .run();
    db
      .insert(schema.generatedCodes)
      .values({ project_id: projectId, version: 2, created_at: '2020-01-01T00:00:00.000Z' })
      .run();

    const since = new Date('2026-06-22T00:00:00.000Z');
    const counts = await repo.getUsageCounts(since);

    expect(counts.todayGenerations).toBe(1);
    expect(counts.totalProjects).toBe(1);
    expect(counts.totalUsers).toBe(2);
  });

  it('returns zeros on empty DB', async () => {
    const counts = await repo.getUsageCounts(new Date('2026-01-01T00:00:00.000Z'));
    expect(counts).toEqual({ todayGenerations: 0, totalProjects: 0, totalUsers: 0 });
  });
});
