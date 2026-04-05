import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from './base/BaseRepository';
import type { GeneratedCode, CodeMetadata } from '@/types/project';

export class CodeRepository extends BaseRepository<GeneratedCode> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'generated_codes');
  }

  async findByProject(projectId: string, version?: number): Promise<GeneratedCode | null> {
    let query = this.supabase.from(this.tableName).select('*').eq('project_id', projectId);

    if (version !== undefined) {
      query = query.eq('version', version);
    } else {
      query = query.order('version', { ascending: false }).limit(1);
    }

    const { data, error } = await query.single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this.toDomain(data);
  }

  async countByProject(projectId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    if (error) throw error;
    return count ?? 0;
  }

  /**
   * Deletes the oldest versions for a project, keeping only the newest `keepCount`.
   * Called after a successful save to enforce the per-project version cap.
   * Errors are thrown so callers can decide whether to surface them.
   */
  async pruneOldVersions(projectId: string, keepCount: number): Promise<void> {
    // Fetch the version numbers to delete (everything beyond the newest N)
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('id, version')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .range(keepCount, 999);

    if (error) throw error;
    if (!data || data.length === 0) return;

    const idsToDelete = data.map((row) => row.id as string);
    const { error: deleteError } = await this.supabase
      .from(this.tableName)
      .delete()
      .in('id', idsToDelete);

    if (deleteError) throw deleteError;
  }

  async getNextVersion(projectId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('version')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return 1;
      throw error;
    }
    return (data?.version ?? 0) + 1;
  }

  async findMetadataByDateRange(from: Date): Promise<Array<{ metadata: CodeMetadata; createdAt: string }>> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('metadata, created_at')
      .gte('created_at', from.toISOString())
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      metadata: (row.metadata as CodeMetadata) ?? {},
      createdAt: row.created_at as string,
    }));
  }

  protected toDomain(row: Record<string, unknown>): GeneratedCode {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      version: row.version as number,
      codeHtml: (row.code_html as string) ?? '',
      codeCss: (row.code_css as string) ?? '',
      codeJs: (row.code_js as string) ?? '',
      framework: (row.framework as GeneratedCode['framework']) ?? 'vanilla',
      aiProvider: (row.ai_provider as string) ?? null,
      aiModel: (row.ai_model as string) ?? null,
      aiPromptUsed: (row.ai_prompt_used as string) ?? null,
      generationTimeMs: (row.generation_time_ms as number) ?? null,
      tokenUsage: (row.token_usage as GeneratedCode['tokenUsage']) ?? null,
      dependencies: (row.dependencies as string[]) ?? [],
      metadata: (row.metadata as CodeMetadata) ?? {},
      createdAt: row.created_at as string,
    };
  }
}
