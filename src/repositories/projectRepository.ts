import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from './base/BaseRepository';
import type { Project, ProjectMetadata } from '@/types/project';

export class ProjectRepository extends BaseRepository<Project> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'projects');
  }

  async findByUserId(userId: string): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  async countTodayGenerations(userId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Step 1: Get user's project IDs
    const { data: userProjects, error: projError } = await this.supabase
      .from(this.tableName)
      .select('id')
      .eq('user_id', userId);

    if (projError) throw projError;

    const projectIds = (userProjects ?? []).map((p) => p.id as string);
    if (projectIds.length === 0) return 0;

    // Step 2: Count today's generations for those projects
    const { count, error } = await this.supabase
      .from('generated_codes')
      .select('id', { count: 'exact', head: true })
      .in('project_id', projectIds)
      .gte('created_at', today.toISOString());

    if (error) throw error;
    return count ?? 0;
  }

  async insertProjectApis(projectId: string, apiIds: string[]): Promise<void> {
    const mappings = apiIds.map((apiId) => ({
      project_id: projectId,
      api_id: apiId,
    }));

    const { error } = await this.supabase.from('project_apis').insert(mappings);
    if (error) throw error;
  }

  async getProjectApiIds(projectId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('project_apis')
      .select('api_id')
      .eq('project_id', projectId);

    if (error) throw error;
    return (data ?? []).map((row) => row.api_id as string);
  }

  async findBySlug(slug: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // not found
      throw error;
    }
    return data ? this.toDomain(data) : null;
  }

  async updateSlug(id: string, slug: string, publishedAt: Date): Promise<Project> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({
        slug,
        published_at: publishedAt.toISOString(),
        status: 'published',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this.toDomain(data);
  }

  protected toDomain(row: Record<string, unknown>): Project {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      organizationId: (row.organization_id as string) ?? null,
      name: row.name as string,
      context: row.context as string,
      status: row.status as Project['status'],
      deployUrl: (row.deploy_url as string) ?? null,
      deployPlatform: (row.deploy_platform as string) ?? null,
      repoUrl: (row.repo_url as string) ?? null,
      previewUrl: (row.preview_url as string) ?? null,
      metadata: (row.metadata as ProjectMetadata) ?? {},
      currentVersion: (row.current_version as number) ?? 0,
      apis: [],
      slug: (row.slug as string) ?? null,
      publishedAt: (row.published_at as string) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
