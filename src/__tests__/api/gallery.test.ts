import { describe, it, expect, vi, beforeEach } from 'vitest';

// Supabase mock
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// GalleryService mock
vi.mock('@/services/galleryService', () => ({
  GalleryService: vi.fn().mockImplementation(() => ({
    getGallery: vi.fn(),
    likeProject: vi.fn(),
    unlikeProject: vi.fn(),
    forkProject: vi.fn(),
  })),
}));

const mockUser = { id: 'user-1', email: 'test@test.com' };

const mockGalleryPage = {
  items: [
    {
      id: 'proj-1',
      slug: 'test-project',
      name: '테스트 프로젝트',
      description: '테스트 설명',
      category: null,
      likesCount: 5,
      isLikedByCurrentUser: false,
      createdAt: '2024-01-01T00:00:00Z',
      ownerName: '홍길동',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 12,
};

function makeSupabaseMock(user: typeof mockUser | null = mockUser) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
  };
}

// ─── GET /api/v1/gallery ───────────────────────────────────────────────────

describe('GET /api/v1/gallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('인증된 사용자 — 200과 갤러리 페이지를 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const { GalleryService } = await import('@/services/galleryService');
    (GalleryService as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      getGallery: vi.fn().mockResolvedValue(mockGalleryPage),
    }));

    const { GET } = await import('@/app/api/v1/gallery/route');
    const request = new Request('http://localhost/api/v1/gallery');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBe(1);
  });

  it('비인증 사용자 — currentUserId=undefined로 200 결과를 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock(null) as never);

    const { GalleryService } = await import('@/services/galleryService');
    const getGalleryMock = vi.fn().mockResolvedValue({ ...mockGalleryPage, items: [] });
    (GalleryService as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      getGallery: getGalleryMock,
    }));

    const { GET } = await import('@/app/api/v1/gallery/route');
    const request = new Request('http://localhost/api/v1/gallery');
    const response = await GET(request);

    expect(response.status).toBe(200);
    // currentUserId should be undefined (passed as undefined to getGallery)
    const callArgs = getGalleryMock.mock.calls[0];
    expect(callArgs[1].currentUserId).toBeUndefined();
  });

  it('pageSize가 51이면 400을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const { GET } = await import('@/app/api/v1/gallery/route');
    const request = new Request('http://localhost/api/v1/gallery?pageSize=51');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('page가 0이면 400을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const { GET } = await import('@/app/api/v1/gallery/route');
    const request = new Request('http://localhost/api/v1/gallery?page=0');
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it('쿼리 파라미터가 올바르게 전달된다 (category, sortBy, search)', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const { GalleryService } = await import('@/services/galleryService');
    const getGalleryMock = vi.fn().mockResolvedValue(mockGalleryPage);
    (GalleryService as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      getGallery: getGalleryMock,
    }));

    const { GET } = await import('@/app/api/v1/gallery/route');
    const request = new Request(
      'http://localhost/api/v1/gallery?category=blog&sortBy=popular&search=날씨&page=2&pageSize=6'
    );
    await GET(request);

    expect(getGalleryMock).toHaveBeenCalledWith(
      { category: 'blog', sortBy: 'popular', search: '날씨' },
      { page: 2, pageSize: 6, currentUserId: 'user-1' }
    );
  });
});

// ─── POST /api/v1/gallery/[id]/like ───────────────────────────────────────

describe('POST /api/v1/gallery/[id]/like', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock(null) as never);

    const { POST } = await import('@/app/api/v1/gallery/[id]/like/route');
    const request = new Request(`http://localhost/api/v1/gallery/${validId}/like`, {
      method: 'POST',
    });
    const response = await POST(request, { params: Promise.resolve({ id: validId }) });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  it('잘못된 UUID 형식이면 400을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const { POST } = await import('@/app/api/v1/gallery/[id]/like/route');
    const request = new Request('http://localhost/api/v1/gallery/not-a-uuid/like', {
      method: 'POST',
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'not-a-uuid' }) });

    expect(response.status).toBe(400);
  });

  it('인증된 사용자 — 좋아요 후 liked:true와 likesCount를 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const { GalleryService } = await import('@/services/galleryService');
    (GalleryService as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      likeProject: vi.fn().mockResolvedValue({ liked: true, likesCount: 6 }),
    }));

    const { POST } = await import('@/app/api/v1/gallery/[id]/like/route');
    const request = new Request(`http://localhost/api/v1/gallery/${validId}/like`, {
      method: 'POST',
    });
    const response = await POST(request, { params: Promise.resolve({ id: validId }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.liked).toBe(true);
    expect(body.data.likesCount).toBe(6);
  });
});

// ─── DELETE /api/v1/gallery/[id]/like ─────────────────────────────────────

describe('DELETE /api/v1/gallery/[id]/like', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('인증된 사용자 — 좋아요 취소 후 liked:false와 likesCount를 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const { GalleryService } = await import('@/services/galleryService');
    (GalleryService as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      unlikeProject: vi.fn().mockResolvedValue({ liked: false, likesCount: 4 }),
    }));

    const { DELETE } = await import('@/app/api/v1/gallery/[id]/like/route');
    const request = new Request(`http://localhost/api/v1/gallery/${validId}/like`, {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: validId }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.liked).toBe(false);
    expect(body.data.likesCount).toBe(4);
  });

  it('비로그인 시 401을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock(null) as never);

    const { DELETE } = await import('@/app/api/v1/gallery/[id]/like/route');
    const request = new Request(`http://localhost/api/v1/gallery/${validId}/like`, {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: validId }) });

    expect(response.status).toBe(401);
  });
});

// ─── POST /api/v1/gallery/[id]/fork ───────────────────────────────────────

describe('POST /api/v1/gallery/[id]/fork', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock(null) as never);

    const { POST } = await import('@/app/api/v1/gallery/[id]/fork/route');
    const request = new Request(`http://localhost/api/v1/gallery/${validId}/fork`, {
      method: 'POST',
    });
    const response = await POST(request, { params: Promise.resolve({ id: validId }) });

    expect(response.status).toBe(401);
  });

  it('잘못된 UUID 형식이면 400을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const { POST } = await import('@/app/api/v1/gallery/[id]/fork/route');
    const request = new Request('http://localhost/api/v1/gallery/not-uuid/fork', {
      method: 'POST',
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'not-uuid' }) });

    expect(response.status).toBe(400);
  });

  it('인증된 사용자 — 포크 성공 시 201과 새 프로젝트 정보를 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);

    const { GalleryService } = await import('@/services/galleryService');
    (GalleryService as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      forkProject: vi
        .fn()
        .mockResolvedValue({ projectId: 'new-proj-1', slug: 'test-project-copy' }),
    }));

    const { POST } = await import('@/app/api/v1/gallery/[id]/fork/route');
    const request = new Request(`http://localhost/api/v1/gallery/${validId}/fork`, {
      method: 'POST',
    });
    const response = await POST(request, { params: Promise.resolve({ id: validId }) });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.projectId).toBe('new-proj-1');
    expect(body.data.slug).toBe('test-project-copy');
  });
});
