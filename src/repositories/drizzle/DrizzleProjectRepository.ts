import { eq, desc, sql, count as drizzleCount } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import type { Project, ProjectMetadata } from '@/types/project';
import type { IProjectRepository } from '@/repositories/interfaces';
import type { QueryOptions } from '@/repositories/interfaces/IBaseRepository';
import { toSnake, buildConditions } from '@/repositories/utils';

type DrizzleDb = NodePgDatabase<typeof schema>;

export class DrizzleProjectRepository implements IProjectRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<Project | null> {
    const rows = await this.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .limit(1);

    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  async findMany(
    filter?: Record<string, unknown>,
    options: QueryOptions = {}
  ): Promise<{ items: Project[]; total: number }> {
    const { page = 1, limit = 20, orderDirection = 'desc' } = options;
    const offset = (page - 1) * limit;

    const conditions = buildConditions(filter);

    const [countResult] = await this.db
      .select({ total: drizzleCount() })
      .from(schema.projects)
      .where(conditions);

    const rows = await this.db
      .select()
      .from(schema.projects)
      .where(conditions)
      .orderBy(orderDirection === 'asc' ? schema.projects.created_at : desc(schema.projects.created_at))
      .offset(offset)
      .limit(limit);

    return {
      items: rows.map((row) => this.toDomain(row)),
      total: countResult?.total ?? 0,
    };
  }

  async create(input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const { apis: _apis, ...rest } = input;
    const dbData = this.toDatabase(rest);

    const [row] = await this.db
      .insert(schema.projects)
      .values(dbData as typeof schema.projects.$inferInsert)
      .returning();

    return this.toDomain(row);
  }

  async update(id: string, input: Partial<Project>): Promise<Project> {
    const { apis: _apis, ...rest } = input;
    const dbData = this.toDatabase(rest);

    const [row] = await this.db
      .update(schema.projects)
      .set({ ...dbData, updated_at: new Date() } as Partial<typeof schema.projects.$inferInsert>)
      .where(eq(schema.projects.id, id))
      .returning();

    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(schema.projects).where(eq(schema.projects.id, id));
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    const conditions = buildConditions(filter);

    const [result] = await this.db
      .select({ total: drizzleCount() })
      .from(schema.projects)
      .where(conditions);

    return result?.total ?? 0;
  }

  async findByUserId(userId: string): Promise<Project[]> {
    const rows = await this.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.user_id, userId))
      .orderBy(desc(schema.projects.created_at));

    return rows.map((row) => this.toDomain(row));
  }

  async countTodayGenerations(userId: string): Promise<number> {
    const result = await this.db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM generated_codes gc JOIN projects p ON p.id = gc.project_id WHERE p.user_id = ${userId} AND gc.created_at >= CURRENT_DATE`
    );
    const row = result.rows[0] as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  }

  async insertProjectApis(projectId: string, apiIds: string[]): Promise<void> {
    if (apiIds.length === 0) return;

    const mappings = apiIds.map((apiId) => ({
      project_id: projectId,
      api_id: apiId,
    }));

    await this.db.insert(schema.projectApis).values(mappings);
  }

  async getProjectApiIds(projectId: string): Promise<string[]> {
    const rows = await this.db
      .select({ api_id: schema.projectApis.api_id })
      .from(schema.projectApis)
      .where(eq(schema.projectApis.project_id, projectId));

    return rows.map((row) => row.api_id);
  }

  async findBySlug(slug: string): Promise<Project | null> {
    const rows = await this.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.slug, slug))
      .limit(1);

    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  async updateSuggestedSlugs(id: string, slugs: string[]): Promise<void> {
    await this.db
      .update(schema.projects)
      .set({ suggested_slugs: slugs })
      .where(eq(schema.projects.id, id));
  }

  async updateSlug(id: string, slug: string, publishedAt: Date): Promise<Project> {
    const [row] = await this.db
      .update(schema.projects)
      .set({
        slug,
        published_at: publishedAt,
        status: 'published',
        updated_at: new Date(),
      })
      .where(eq(schema.projects.id, id))
      .returning();

    return this.toDomain(row);
  }

  private toDomain(row: typeof schema.projects.$inferSelect): Project {
    return {
      id: row.id,
      userId: row.user_id,
      organizationId: row.organization_id ?? null,
      name: row.name,
      context: row.context ?? '',
      status: row.status as Project['status'],
      deployUrl: row.deploy_url ?? null,
      deployPlatform: row.deploy_platform ?? null,
      repoUrl: row.repo_url ?? null,
      previewUrl: row.preview_url ?? null,
      metadata: (row.metadata as ProjectMetadata) ?? {},
      currentVersion: row.current_version ?? 0,
      apis: [],
      slug: row.slug ?? null,
      suggestedSlugs: row.suggested_slugs ?? undefined,
      publishedAt: row.published_at ? String(row.published_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private toDatabase(model: Partial<Project>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(model)) {
      if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
      result[toSnake(key)] = value;
    }
    return result;
  }
}
