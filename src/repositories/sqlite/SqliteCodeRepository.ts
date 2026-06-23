import { eq, and, desc, sql, count as drizzleCount, inArray, gte } from 'drizzle-orm';
import type { SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import type { GeneratedCode, CodeMetadata } from '@/types/project';
import type { ICodeRepository } from '@/repositories/interfaces';
import type { QueryOptions } from '@/repositories/interfaces/IBaseRepository';
import { toDatabaseRow, normalizePagination, buildConditions } from '@/repositories/utils';

/**
 * SQLite 구현 (임베디드 단일 인스턴스·단일 사용자 경로).
 *
 * 매핑 기준은 Supabase 레포(`codeRepository.ts`)와 동일하다:
 * - 타임스탬프(created_at)는 SQLite에 ISO 문자열로 저장되며, 도메인은 `string`을 기대하므로 그대로 반환.
 * - JSON 컬럼(token_usage / dependencies / metadata)은 drizzle(mode:json)가 이미
 *   객체/배열로 역직렬화해 돌려주므로 JSON.parse 불필요.
 * - generated_codes에는 updated_at 컬럼이 없다(BaseRepository.update의 updated_at 주입 패턴 미적용).
 * - (project_id, version) UNIQUE 제약. getNextVersion은 MAX(version)+1(없으면 1).
 */
export class SqliteCodeRepository implements ICodeRepository {
  constructor(private db: SqliteDb) {}

  async findById(id: string): Promise<GeneratedCode | null> {
    const row = this.db
      .select()
      .from(schema.generatedCodes)
      .where(eq(schema.generatedCodes.id, id))
      .limit(1)
      .get();

    return row ? this.toDomain(row) : null;
  }

  async findMany(
    filter?: Record<string, unknown>,
    options: QueryOptions = {},
  ): Promise<{ items: GeneratedCode[]; total: number }> {
    const { orderDirection = 'desc' } = options;
    const { offset, limit } = normalizePagination(options);

    const conditions = buildConditions(filter);

    const countResult = this.db
      .select({ total: drizzleCount() })
      .from(schema.generatedCodes)
      .where(conditions)
      .get();

    const rows = this.db
      .select()
      .from(schema.generatedCodes)
      .where(conditions)
      .orderBy(
        orderDirection === 'asc'
          ? schema.generatedCodes.created_at
          : desc(schema.generatedCodes.created_at),
      )
      .offset(offset)
      .limit(limit)
      .all();

    return {
      items: rows.map((row) => this.toDomain(row)),
      total: countResult?.total ?? 0,
    };
  }

  async create(input: Omit<GeneratedCode, 'id' | 'createdAt' | 'updatedAt'>): Promise<GeneratedCode> {
    const dbData = toDatabaseRow(input);

    const [row] = this.db
      .insert(schema.generatedCodes)
      .values(dbData as typeof schema.generatedCodes.$inferInsert)
      .returning()
      .all();

    return this.toDomain(row);
  }

  async update(id: string, input: Partial<GeneratedCode>): Promise<GeneratedCode> {
    const dbData = toDatabaseRow(input);

    // generated_codes에는 updated_at 컬럼이 없으므로 추가하지 않는다.
    const [row] = this.db
      .update(schema.generatedCodes)
      .set(dbData as Partial<typeof schema.generatedCodes.$inferInsert>)
      .where(eq(schema.generatedCodes.id, id))
      .returning()
      .all();

    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    this.db.delete(schema.generatedCodes).where(eq(schema.generatedCodes.id, id)).run();
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    const conditions = buildConditions(filter);

    const result = this.db
      .select({ total: drizzleCount() })
      .from(schema.generatedCodes)
      .where(conditions)
      .get();

    return result?.total ?? 0;
  }

  async findByProject(projectId: string, version?: number): Promise<GeneratedCode | null> {
    if (version !== undefined) {
      const row = this.db
        .select()
        .from(schema.generatedCodes)
        .where(
          and(
            eq(schema.generatedCodes.project_id, projectId),
            eq(schema.generatedCodes.version, version),
          ),
        )
        .limit(1)
        .get();

      return row ? this.toDomain(row) : null;
    }

    // version 미지정: 최신 버전 1건
    const row = this.db
      .select()
      .from(schema.generatedCodes)
      .where(eq(schema.generatedCodes.project_id, projectId))
      .orderBy(desc(schema.generatedCodes.version))
      .limit(1)
      .get();

    return row ? this.toDomain(row) : null;
  }

  async countByProject(projectId: string): Promise<number> {
    const result = this.db
      .select({ total: drizzleCount() })
      .from(schema.generatedCodes)
      .where(eq(schema.generatedCodes.project_id, projectId))
      .get();

    return result?.total ?? 0;
  }

  async pruneOldVersions(projectId: string, keepCount: number): Promise<void> {
    // 최신 keepCount개를 제외한 나머지(오래된) 버전들의 id를 조회 후 삭제.
    // SQLite는 OFFSET 단독 사용을 허용하지 않으므로 대형 sentinel LIMIT으로 전 행을 대상으로 한다.
    // (drizzle은 limit(-1)을 LIMIT 절로 직렬화하지 않아 bare OFFSET이 되어 syntax error 발생)
    const toDelete = this.db
      .select({ id: schema.generatedCodes.id })
      .from(schema.generatedCodes)
      .where(eq(schema.generatedCodes.project_id, projectId))
      .orderBy(desc(schema.generatedCodes.version))
      .limit(Number.MAX_SAFE_INTEGER)
      .offset(keepCount)
      .all();

    if (toDelete.length === 0) return;

    const idsToDelete = toDelete.map((row) => row.id);
    this.db
      .delete(schema.generatedCodes)
      .where(inArray(schema.generatedCodes.id, idsToDelete))
      .run();
  }

  async getNextVersion(projectId: string): Promise<number> {
    const row = this.db
      .select({ version: schema.generatedCodes.version })
      .from(schema.generatedCodes)
      .where(eq(schema.generatedCodes.project_id, projectId))
      .orderBy(desc(schema.generatedCodes.version))
      .limit(1)
      .get();

    if (!row) return 1;
    return (row.version ?? 0) + 1;
  }

  // created_at은 ISO8601 텍스트라 사전식 비교(>=)가 곧 시간순 비교. metadata(mode:json)는 객체로 역직렬화됨.
  async findMetadataByDateRange(
    from: Date,
  ): Promise<Array<{ metadata: CodeMetadata; createdAt: string }>> {
    const rows = this.db
      .select({
        metadata: schema.generatedCodes.metadata,
        created_at: schema.generatedCodes.created_at,
      })
      .from(schema.generatedCodes)
      .where(gte(schema.generatedCodes.created_at, from.toISOString()))
      .orderBy(desc(schema.generatedCodes.created_at))
      .all();

    return rows.map((r) => ({
      metadata: (r.metadata as CodeMetadata) ?? {},
      createdAt: String(r.created_at),
    }));
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
      dependencies: (row.dependencies as string[]) ?? [],
      metadata: (row.metadata as CodeMetadata) ?? {},
      createdAt: row.created_at as string,
    };
  }
}
