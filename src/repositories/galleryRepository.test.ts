import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GalleryRepository } from './galleryRepository';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Supabase query chain mock.
 * Every method returns `this` (for chaining) by default.
 * Individual tests resolve the chain by overriding `single`, `maybeSingle`,
 * `range`, `in`, etc. with `mockResolvedValueOnce`.
 */
function makeChain() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };
  return chain;
}

type MockChain = ReturnType<typeof makeChain>;

function makeSupabase(chains: MockChain[] | MockChain, rpcResults?: Array<{ data: unknown; error: unknown }>) {
  const rpcQueue = rpcResults ?? [];
  let rpcIdx = 0;
  const rpc = vi.fn().mockImplementation(() => {
    const result = rpcQueue[rpcIdx] ?? { data: null, error: null };
    rpcIdx += 1;
    return Promise.resolve(result);
  });

  const chainArray = Array.isArray(chains) ? chains : [chains];
  let fromIdx = 0;
  const from = vi.fn().mockImplementation(() => {
    const c = chainArray[fromIdx] ?? chainArray[chainArray.length - 1];
    fromIdx += 1;
    return c;
  });

  return {
    rpc,
    supabase: { from, rpc } as unknown as SupabaseClient,
  };
}

// ---------------------------------------------------------------------------
// findPublished
// ---------------------------------------------------------------------------

describe('GalleryRepository.findPublished', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('올바른 GalleryPage 형태를 반환한다', async () => {
    const projectsChain = makeChain();
    const likesChain = makeChain();
    const { supabase } = makeSupabase([projectsChain, likesChain]);

    const rows = [
      {
        id: 'proj-1',
        slug: 'my-project',
        name: 'My Project',
        context: 'A cool project',
        likes_count: 5,
        created_at: '2026-01-01T00:00:00Z',
        metadata: { inferredTheme: 'dashboard' },
        users: { name: 'Alice' },
      },
    ];

    // Main query: range() is the last chain call before await
    projectsChain.range.mockResolvedValueOnce({ data: rows, error: null, count: 1 });

    // Likes query: in() is the last chain call before await
    likesChain.in.mockResolvedValueOnce({
      data: [{ project_id: 'proj-1' }],
      error: null,
    });

    const repo = new GalleryRepository(supabase);
    const result = await repo.findPublished(
      { sortBy: 'newest' },
      { page: 1, pageSize: 20, currentUserId: 'user-1' }
    );

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);

    const item = result.items[0];
    expect(item.id).toBe('proj-1');
    expect(item.slug).toBe('my-project');
    expect(item.name).toBe('My Project');
    expect(item.description).toBe('A cool project');
    expect(item.category).toBe('dashboard');
    expect(item.likesCount).toBe(5);
    expect(item.isLikedByCurrentUser).toBe(true);
    expect(item.ownerName).toBe('Alice');
  });

  it('currentUserId가 없으면 isLikedByCurrentUser는 false이다', async () => {
    const chain = makeChain();
    const { supabase } = makeSupabase(chain);

    const rows = [
      {
        id: 'proj-2',
        slug: 'proj-2',
        name: 'Proj 2',
        context: null,
        likes_count: 0,
        created_at: '2026-02-01T00:00:00Z',
        metadata: null,
        users: null,
      },
    ];

    chain.range.mockResolvedValueOnce({ data: rows, error: null, count: 1 });

    const repo = new GalleryRepository(supabase);
    const result = await repo.findPublished({}, { page: 1, pageSize: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].isLikedByCurrentUser).toBe(false);
    expect(result.items[0].ownerName).toBeNull();
    expect(result.items[0].category).toBeNull();
  });

  it('DB 오류 시 예외를 던진다', async () => {
    const chain = makeChain();
    const { supabase } = makeSupabase(chain);

    chain.range.mockResolvedValueOnce({
      data: null,
      error: { message: 'DB error', code: '500' },
      count: null,
    });

    const repo = new GalleryRepository(supabase);
    await expect(repo.findPublished({}, { page: 1, pageSize: 10 })).rejects.toBeDefined();
  });

  it('popular 정렬 시 likes_count DESC로 정렬한다', async () => {
    const chain = makeChain();
    const { supabase } = makeSupabase(chain);

    chain.range.mockResolvedValueOnce({ data: [], error: null, count: 0 });

    const repo = new GalleryRepository(supabase);
    await repo.findPublished({ sortBy: 'popular' }, { page: 1, pageSize: 10 });

    expect(chain.order).toHaveBeenCalledWith('likes_count', { ascending: false });
  });
});

// ---------------------------------------------------------------------------
// toggleLike
// ---------------------------------------------------------------------------

describe('GalleryRepository.toggleLike', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('아직 좋아요를 누르지 않은 경우 — INSERT 후 liked: true 반환', async () => {
    // New delete-first pattern:
    // 1) from('project_likes').delete().eq().eq().select() → delete returns no rows (not liked)
    // 2) from('project_likes').insert()                    → insert like
    // 3) rpc('increment_project_likes')
    // 4) from('projects').select().eq().single()           → fetch updated count

    const deleteChain = makeChain();
    const insertChain = makeChain();
    const countChain = makeChain();

    const { supabase, rpc } = makeSupabase(
      [deleteChain, insertChain, countChain],
      [{ data: null, error: null }] // rpc result
    );

    // 1) delete returns empty array → was not liked
    deleteChain.select.mockResolvedValueOnce({ data: [], error: null });

    // 2) insert resolves when awaited
    insertChain.insert.mockResolvedValueOnce({ error: null });

    // 4) fetch count
    countChain.single.mockResolvedValueOnce({ data: { likes_count: 3 }, error: null });

    const repo = new GalleryRepository(supabase);
    const result = await repo.toggleLike('proj-1', 'user-1');

    expect(result.liked).toBe(true);
    expect(result.newCount).toBe(3);
    expect(rpc).toHaveBeenCalledWith('increment_project_likes', { p_id: 'proj-1' });
  });

  it('이미 좋아요를 누른 경우 — DELETE 후 liked: false 반환', async () => {
    // New delete-first pattern:
    // 1) from('project_likes').delete().eq().eq().select() → delete returns a row (was liked)
    // 2) rpc('decrement_project_likes')
    // 3) from('projects').select().eq().single()           → fetch updated count

    const deleteChain = makeChain();
    const countChain = makeChain();

    const { supabase, rpc } = makeSupabase(
      [deleteChain, countChain],
      [{ data: null, error: null }] // rpc result
    );

    // 1) delete returns a row → was liked
    deleteChain.select.mockResolvedValueOnce({ data: [{ id: 'like-id' }], error: null });

    // 3) fetch count
    countChain.single.mockResolvedValueOnce({ data: { likes_count: 1 }, error: null });

    const repo = new GalleryRepository(supabase);
    const result = await repo.toggleLike('proj-1', 'user-1');

    expect(result.liked).toBe(false);
    expect(result.newCount).toBe(1);
    expect(rpc).toHaveBeenCalledWith('decrement_project_likes', { p_id: 'proj-1' });
  });
});

// ---------------------------------------------------------------------------
// forkProject
// ---------------------------------------------------------------------------

describe('GalleryRepository.forkProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('새로운 프로젝트를 -copy 슬러그로 생성한다', async () => {
    const sourceProject = {
      id: 'orig-1',
      slug: 'my-site',
      name: 'My Site',
      context: 'desc',
      status: 'published',
      user_id: 'owner-1',
      organization_id: null,
      deploy_url: null,
      deploy_platform: null,
      repo_url: null,
      preview_url: null,
      metadata: {},
      current_version: 2,
      published_at: '2026-01-01T00:00:00Z',
      likes_count: 10,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const newProject = { id: 'new-1', slug: 'my-site-copy' };

    const latestCode = {
      id: 'code-1',
      project_id: 'orig-1',
      version: 2,
      code_html: '<html/>',
      code_css: '',
      code_js: '',
      framework: 'vanilla',
      ai_provider: null,
      ai_model: null,
      ai_prompt_used: 'some prompt',
      generation_time_ms: null,
      token_usage: { input: 100, output: 200 },
      dependencies: [],
      metadata: {},
    };

    // from() calls in order:
    // 1) fetch source project  → chain1
    // 2) slug collision check  → chain2 (no collision)
    // 3) insert new project    → chain3
    // 4) fetch latest code     → chain4
    // 5) insert code copy      → chain5
    // 6) update current_version → chain6

    const chain1 = makeChain(); // fetch source
    const chain2 = makeChain(); // slug check
    const chain3 = makeChain(); // insert project
    const chain4 = makeChain(); // fetch code
    const chain5 = makeChain(); // insert code
    const chain6 = makeChain(); // update version

    const { supabase } = makeSupabase([chain1, chain2, chain3, chain4, chain5, chain6]);

    // 1) source project
    chain1.single.mockResolvedValueOnce({ data: sourceProject, error: null });

    // 2) slug check → no collision
    chain2.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    // 3) insert project → chain returns self, .select().single() resolves
    chain3.insert.mockReturnValue(chain3);
    chain3.select.mockReturnValue(chain3);
    chain3.single.mockResolvedValueOnce({ data: newProject, error: null });

    // 4) latest code
    chain4.maybeSingle.mockResolvedValueOnce({ data: latestCode, error: null });

    // 5) insert code copy — insert is terminal
    chain5.insert.mockResolvedValueOnce({ error: null });

    // 6) update current_version: update().eq() — eq is terminal
    chain6.update.mockReturnValue(chain6);
    chain6.eq.mockResolvedValueOnce({ error: null });

    const repo = new GalleryRepository(supabase);
    const result = await repo.forkProject('orig-1', 'new-owner-1');

    expect(result.newProjectId).toBe('new-1');
    expect(result.newSlug).toBe('my-site-copy');

    // I2: Verify sensitive fields are nulled out in the inserted code copy
    const insertedPayload = chain5.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedPayload.ai_prompt_used).toBeNull();
    expect(insertedPayload.token_usage).toBeNull();
  });

  it('슬러그 충돌 시 -copy-1 슬러그를 사용한다', async () => {
    const sourceProject = {
      id: 'orig-2',
      slug: 'site',
      name: 'Site',
      context: null,
      status: 'published',
      user_id: 'owner-2',
      organization_id: null,
      deploy_url: null,
      deploy_platform: null,
      repo_url: null,
      preview_url: null,
      metadata: {},
      current_version: 1,
      published_at: null,
      likes_count: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const newProject = { id: 'new-2', slug: 'site-copy-1' };

    // from() calls:
    // 1) fetch source
    // 2) slug check 'site-copy' → collision
    // 3) slug check 'site-copy-1' → no collision
    // 4) insert new project
    // 5) fetch latest code (none)

    const chain1 = makeChain();
    const chain2 = makeChain(); // collision
    const chain3 = makeChain(); // no collision
    const chain4 = makeChain(); // insert
    const chain5 = makeChain(); // code fetch

    const { supabase } = makeSupabase([chain1, chain2, chain3, chain4, chain5]);

    chain1.single.mockResolvedValueOnce({ data: sourceProject, error: null });
    chain2.maybeSingle.mockResolvedValueOnce({ data: { id: 'existing' }, error: null });
    chain3.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    chain4.insert.mockReturnValue(chain4);
    chain4.select.mockReturnValue(chain4);
    chain4.single.mockResolvedValueOnce({ data: newProject, error: null });

    // no latest code
    chain5.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const repo = new GalleryRepository(supabase);
    const result = await repo.forkProject('orig-2', 'new-owner-2');

    expect(result.newSlug).toBe('site-copy-1');
    expect(result.newProjectId).toBe('new-2');
  });

  it('buildForkSlug가 MAX_ATTEMPTS 초과 시 에러를 던진다', async () => {
    const MAX_ATTEMPTS = 20;
    const sourceProject = {
      id: 'orig-3',
      slug: 'busy-slug',
      name: 'Busy Slug',
      context: null,
      status: 'published',
      user_id: 'owner-3',
      organization_id: null,
      deploy_url: null,
      deploy_platform: null,
      repo_url: null,
      preview_url: null,
      metadata: {},
      current_version: 1,
      published_at: null,
      likes_count: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    // We need: 1 chain for source fetch + (MAX_ATTEMPTS + 1) slug collision chains
    // attempt=0: base candidate 'busy-slug-copy' → collision
    // attempt=1..MAX_ATTEMPTS: 'busy-slug-copy-1' ... 'busy-slug-copy-20' → all collision
    const totalSlugChecks = MAX_ATTEMPTS + 1; // 21 checks
    const sourceChain = makeChain();
    const slugChains = Array.from({ length: totalSlugChecks }, () => makeChain());

    const { supabase } = makeSupabase([sourceChain, ...slugChains]);

    sourceChain.single.mockResolvedValueOnce({ data: sourceProject, error: null });

    // All slug checks return a collision
    slugChains.forEach((c) => {
      c.maybeSingle.mockResolvedValueOnce({ data: { id: 'collision' }, error: null });
    });

    const repo = new GalleryRepository(supabase);
    await expect(repo.forkProject('orig-3', 'new-owner-3')).rejects.toThrow(
      /MAX_ATTEMPTS/
    );
  });
});
