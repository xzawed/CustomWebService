import type { SupabaseClient } from '@supabase/supabase-js';
import type { GalleryFilter, GalleryItem, GalleryPage } from '@/types/gallery';

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  context: string | null;
  likes_count: number;
  created_at: string;
  metadata: Record<string, unknown> | null;
  users?: { name: string | null } | null;
}

export class GalleryRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findPublished(
    filter: GalleryFilter,
    options: { page: number; pageSize: number; currentUserId?: string }
  ): Promise<GalleryPage> {
    const { page, pageSize, currentUserId } = options;
    const offset = (page - 1) * pageSize;

    // Build the main query
    // We always fetch without a project_likes join — likes are checked separately
    // to avoid inner-join semantics that would exclude non-liked projects.
    let query = this.supabase
      .from('projects')
      .select(
        `id, slug, name, context, likes_count, created_at, metadata, users!projects_user_id_fkey ( name )`,
        { count: 'exact' }
      )
      .eq('status', 'published')
      .not('slug', 'is', null);

    if (filter.category) {
      query = query.eq('metadata->>inferredTheme', filter.category);
    }

    if (filter.search) {
      query = query.or(
        `name.ilike.%${filter.search}%,context.ilike.%${filter.search}%`
      );
    }

    if (filter.sortBy === 'popular') {
      query = query.order('likes_count', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as ProjectRow[];

    // Fetch which of these projects the current user has liked (single query)
    let likedProjectIds = new Set<string>();
    if (currentUserId && rows.length > 0) {
      const projectIds = rows.map((r) => r.id);
      const { data: likesData, error: likesError } = await this.supabase
        .from('project_likes')
        .select('project_id')
        .eq('user_id', currentUserId)
        .in('project_id', projectIds);

      if (likesError) throw likesError;
      likedProjectIds = new Set((likesData ?? []).map((l) => l.project_id as string));
    }

    const items: GalleryItem[] = rows.map((row) => {
      const usersField = row.users as { name: string | null } | null | undefined;
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.context,
        category: (row.metadata?.inferredTheme as string) ?? null,
        likesCount: row.likes_count ?? 0,
        isLikedByCurrentUser: likedProjectIds.has(row.id),
        createdAt: row.created_at,
        ownerName: usersField?.name ?? null,
      };
    });

    return { items, total: count ?? 0, page, pageSize };
  }

  async toggleLike(
    projectId: string,
    userId: string
  ): Promise<{ liked: boolean; newCount: number }> {
    // Check if the like already exists
    const { data: existing, error: checkError } = await this.supabase
      .from('project_likes')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError) throw checkError;

    if (existing) {
      // Unlike: delete the row and decrement count
      const { error: deleteError } = await this.supabase
        .from('project_likes')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      const { error: rpcError } = await this.supabase.rpc('decrement_project_likes', {
        p_id: projectId,
      });
      if (rpcError) throw rpcError;
    } else {
      // Like: insert row and increment count
      const { error: insertError } = await this.supabase.from('project_likes').insert({
        project_id: projectId,
        user_id: userId,
      });

      if (insertError) throw insertError;

      const { error: rpcError } = await this.supabase.rpc('increment_project_likes', {
        p_id: projectId,
      });
      if (rpcError) throw rpcError;
    }

    // Fetch updated count
    const { data: projectData, error: fetchError } = await this.supabase
      .from('projects')
      .select('likes_count')
      .eq('id', projectId)
      .single();

    if (fetchError) throw fetchError;

    return {
      liked: !existing,
      newCount: (projectData?.likes_count as number) ?? 0,
    };
  }

  async forkProject(
    projectId: string,
    newOwnerId: string
  ): Promise<{ newProjectId: string; newSlug: string }> {
    // Fetch the source project
    const { data: source, error: srcError } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (srcError) throw srcError;
    if (!source) throw new Error(`Project ${projectId} not found`);

    // Generate a unique slug for the fork
    const baseSlug = await this.buildForkSlug(
      source.slug as string | null,
      source.name as string
    );

    // Insert the forked project
    const { data: newProject, error: insertError } = await this.supabase
      .from('projects')
      .insert({
        user_id: newOwnerId,
        organization_id: null,
        name: (source.name as string) + ' (Fork)',
        context: source.context,
        status: 'draft',
        deploy_url: null,
        deploy_platform: null,
        repo_url: null,
        preview_url: null,
        metadata: source.metadata,
        current_version: 0,
        slug: baseSlug,
        published_at: null,
        likes_count: 0,
      })
      .select('id, slug')
      .single();

    if (insertError) throw insertError;

    const newProjectId = newProject.id as string;
    const newSlug = newProject.slug as string;

    // Copy the latest generated code for this project
    const { data: latestCode, error: codeError } = await this.supabase
      .from('generated_codes')
      .select('*')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeError) throw codeError;

    if (latestCode) {
      const { error: codeCopyError } = await this.supabase.from('generated_codes').insert({
        project_id: newProjectId,
        version: 1,
        code_html: latestCode.code_html,
        code_css: latestCode.code_css,
        code_js: latestCode.code_js,
        framework: latestCode.framework,
        ai_provider: latestCode.ai_provider,
        ai_model: latestCode.ai_model,
        ai_prompt_used: latestCode.ai_prompt_used,
        generation_time_ms: latestCode.generation_time_ms,
        token_usage: latestCode.token_usage,
        dependencies: latestCode.dependencies,
        metadata: latestCode.metadata,
      });

      if (codeCopyError) throw codeCopyError;

      // Update current_version on the new project
      const { error: updateError } = await this.supabase
        .from('projects')
        .update({ current_version: 1 })
        .eq('id', newProjectId);

      if (updateError) throw updateError;
    }

    return { newProjectId, newSlug };
  }

  private async buildForkSlug(sourceSlug: string | null, sourceName: string): Promise<string> {
    const base = sourceSlug
      ? `${sourceSlug}-copy`
      : sourceName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') + '-copy';

    let candidate = base;
    let attempt = 0;

    while (true) {
      const { data, error } = await this.supabase
        .from('projects')
        .select('id')
        .eq('slug', candidate)
        .maybeSingle();

      if (error) throw error;
      if (!data) return candidate;

      attempt += 1;
      candidate = `${base}-${attempt}`;
    }
  }
}
