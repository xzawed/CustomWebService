import { eq, desc, sql, count as drizzleCount, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import type { GeneratedCode, CodeMetadata } from '@/types/project';
import type { ICodeRepository } from '@/repositories/interfaces';
import type { QueryOptions } from '@/repositories/interfaces/IBaseRepository';
import { toSnake, buildConditions } from '@/repositories/utils';

type DrizzleDb = NodePgDatabase<typeof schema>;

export class DrizzleCodeRepository implements ICodeRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<GeneratedCode | null> {
    const rows = await this.db
      .select()
      .from(schema.generatedCodes)
      .where(eq(schema.generatedCodes.id, id))
      .limit(1);

    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  async findMany(
    filter?: Record<string, unknown>,
    options: QueryOptions = {}
  ): Promise<{ items: GeneratedCode[]; total: number }> {
    const { page = 1, limit = 20, orderDirection = 'desc' } = options;
    const offset = (page - 1) * limit;

    const conditions = buildConditions(filter);

    const [countResult] = await this.db
      .select({ total: drizzleCount() })
      .from(schema.generatedCodes)
      .where(conditions);

    const rows = await this.db
      .select()
      .from(schema.generatedCodes)
      .where(conditions)
      .orderBy(orderDirection === 'asc' ? schema.generatedCodes.created_at : desc(schema.generatedCodes.created_at))
      .offset(offset)
      .limit(limit);

    return {
      items: rows.map((row) => this.toDomain(row)),
      total: countResult?.total ?? 0,
    };
  }

  async create(input: Omit<GeneratedCode, 'id' | 'createdAt' | 'updatedAt'>): Promise<GeneratedCode> {
    const dbData = this.toDatabase(input);

    const [row] = await this.db
      .insert(schema.generatedCodes)
      .values(dbData as typeof schema.generatedCodes.$inferInsert)
      .returning();

    return this.toDomain(row);
  }

  async update(id: string, input: Partial<GeneratedCode>): Promise<GeneratedCode> {
    const dbData = this.toDatabase(input);

    // generated_codes has no updated_at column, so we don't add it
    const [row] = await this.db
      .update(schema.generatedCodes)
      .set(dbData as Partial<typeof schema.generatedCodes.$inferInsert>)
      .where(eq(schema.generatedCodes.id, id))
      .returning();

    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(schema.generatedCodes).where(eq(schema.generatedCodes.id, id));
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    const conditions = buildConditions(filter);

    const [result] = await this.db
      .select({ total: drizzleCount() })
      .from(schema.generatedCodes)
      .where(conditions);

    return result?.total ?? 0;
  }

  async findByProject(projectId: string, version?: number): Promise<GeneratedCode | null> {
    if (version !== undefined) {
      const rows = await this.db
        .select()
        .from(schema.generatedCodes)
        .where(
          and(
            eq(schema.generatedCodes.project_id, projectId),
            eq(schema.generatedCodes.version, version)
          )
        )
        .limit(1);

      return rows.length > 0 ? this.toDomain(rows[0]) : null;
    }

    // No version specified: get the latest
    const rows = await this.db
      .select()
      .from(schema.generatedCodes)
      .where(eq(schema.generatedCodes.project_id, projectId))
      .orderBy(desc(schema.generatedCodes.version))
      .limit(1);

    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  async countByProject(projectId: string): Promise<number> {
    const [result] = await this.db
      .select({ total: drizzleCount() })
      .from(schema.generatedCodes)
      .where(eq(schema.generatedCodes.project_id, projectId));

    return result?.total ?? 0;
  }

  async pruneOldVersions(projectId: string, keepCount: number): Promise<void> {
    // Get IDs of versions to delete (everything beyond the newest keepCount)
    const toDelete = await this.db
      .select({ id: schema.generatedCodes.id })
      .from(schema.generatedCodes)
      .where(eq(schema.generatedCodes.project_id, projectId))
      .orderBy(desc(schema.generatedCodes.version))
      .offset(keepCount);

    if (toDelete.length === 0) return;

    const idsToDelete = toDelete.map((row) => row.id);
    await this.db.execute(
      sql`DELETE FROM generated_codes WHERE id = ANY(${idsToDelete})`
    );
  }

  async getNextVersion(projectId: string): Promise<number> {
    const rows = await this.db
      .select({ version: schema.generatedCodes.version })
      .from(schema.generatedCodes)
      .where(eq(schema.generatedCodes.project_id, projectId))
      .orderBy(desc(schema.generatedCodes.version))
      .limit(1);

    if (rows.length === 0) return 1;
    return (rows[0].version ?? 0) + 1;
  }

  private toDomain(row: typeof schema.generatedCodes.$inferSelect): GeneratedCode {
    return {
      id: row.id,
      projectId: row.project_id,
      version: row.version,
      codeHtml: row.code_html ?? '',
      codeCss: row.code_css ?? '',
      codeJs: row.code_js ?? '',
      framework: (row.framework as GeneratedCode['framework']) ?? 'vanilla',
      aiProvider: row.ai_provider ?? null,
      aiModel: row.ai_model ?? null,
      aiPromptUsed: row.ai_prompt_used ?? null,
      generationTimeMs: row.generation_time_ms ?? null,
      tokenUsage: (row.token_usage as GeneratedCode['tokenUsage']) ?? null,
      dependencies: row.dependencies ?? [],
      metadata: (row.metadata as CodeMetadata) ?? {},
      createdAt: String(row.created_at),
    };
  }

  private toDatabase(model: Partial<GeneratedCode>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(model)) {
      if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
      result[toSnake(key)] = value;
    }
    return result;
  }
}
