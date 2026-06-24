/**
 * Task 18: 소유권 격리 테스트
 *
 * 각 라우트에 대해 "타인 소유 project 접근 시 403 (status 라우트는 not_found)"을 검증한다.
 * getAuthUser를 user B로 모킹하고 projectRepo.findById가 user A 소유 project를 반환 → 격리 확인.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/repositories/factory', () => ({
  createProjectRepository: vi.fn(),
  createCodeRepository: vi.fn(),
  createCatalogRepository: vi.fn(),
  createUserApiKeyRepository: vi.fn(),
}));

// stub out heavy deps that are pulled in by routes
vi.mock('@/lib/ai/codeParser', () => ({
  assembleHtml: vi.fn().mockReturnValue('<!DOCTYPE html><html></html>'),
}));

vi.mock('@/services/factory', () => ({
  createRateLimitService: vi.fn().mockReturnValue({
    checkAndIncrementDailyLimit: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/providers/ai/AiProviderFactory', () => ({
  AiProviderFactory: { create: vi.fn() },
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/ai/generationTracker', () => ({
  generationTracker: { get: vi.fn().mockReturnValue(undefined) },
}));

// ---------- Shared data ----------
const userB = { id: 'user-B', email: 'b@example.com', name: null, avatarUrl: null };
// Use valid UUIDs where schemas require them
const PROJECT_UUID = '11111111-1111-4111-a111-111111111111';
const projectOwnedByA = {
  id: PROJECT_UUID,
  userId: 'user-A',
  context: '테스트',
  status: 'generated',
  name: 'proj',
};

// ---------- Tests ----------
describe('소유권 격리 (Task 18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. preview/[projectId]
  // ─────────────────────────────────────────────────────────────
  describe('GET /api/v1/preview/[projectId]', () => {
    it('타인 소유 프로젝트 접근 시 403을 반환한다', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(userB);

      const { createProjectRepository } = await import('@/repositories/factory');
      vi.mocked(createProjectRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(projectOwnedByA),
      } as never);

      const { GET } = await import('@/app/api/v1/preview/[projectId]/route');
      const res = await GET(
        new Request(`https://app/api/v1/preview/${PROJECT_UUID}`),
        { params: Promise.resolve({ projectId: PROJECT_UUID }) },
      );
      expect(res.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. suggest-modification
  // ─────────────────────────────────────────────────────────────
  describe('POST /api/v1/suggest-modification', () => {
    it('타인 소유 프로젝트 접근 시 403을 반환한다', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(userB);

      const { createProjectRepository } = await import('@/repositories/factory');
      vi.mocked(createProjectRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(projectOwnedByA),
        getProjectApiIds: vi.fn().mockResolvedValue([]),
      } as never);

      const { POST } = await import('@/app/api/v1/suggest-modification/route');
      const res = await POST(
        new Request('https://app/api/v1/suggest-modification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: PROJECT_UUID }),
        }),
      );
      expect(res.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. projects/[id]/rollback
  // ─────────────────────────────────────────────────────────────
  describe('POST /api/v1/projects/[id]/rollback', () => {
    it('타인 소유 프로젝트 접근 시 403을 반환한다', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(userB);

      const { createProjectRepository } = await import('@/repositories/factory');
      vi.mocked(createProjectRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(projectOwnedByA),
        update: vi.fn(),
      } as never);

      const { POST } = await import('@/app/api/v1/projects/[id]/rollback/route');
      const res = await POST(
        new Request(`https://app/api/v1/projects/${PROJECT_UUID}/rollback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: 1 }),
        }),
        { params: Promise.resolve({ id: PROJECT_UUID }) },
      );
      expect(res.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. generate/status/[projectId]  — not_found 규약 유지
  // ─────────────────────────────────────────────────────────────
  describe('GET /api/v1/generate/status/[projectId]', () => {
    it('타인 소유 프로젝트 접근 시 not_found 상태를 반환한다', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(userB);

      // tracker returns null → falls through to DB lookup
      const { generationTracker } = await import('@/lib/ai/generationTracker');
      vi.mocked(generationTracker.get).mockReturnValue(undefined);

      const { createProjectRepository } = await import('@/repositories/factory');
      vi.mocked(createProjectRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(projectOwnedByA),
      } as never);

      const { GET } = await import('@/app/api/v1/generate/status/[projectId]/route');
      const res = await GET(
        new Request(`https://app/api/v1/generate/status/${PROJECT_UUID}`),
        { params: Promise.resolve({ projectId: PROJECT_UUID }) },
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe('not_found');
    });

    it('존재하지 않는 프로젝트 접근 시 not_found 상태를 반환한다', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(userB);

      const { generationTracker } = await import('@/lib/ai/generationTracker');
      vi.mocked(generationTracker.get).mockReturnValue(undefined);

      const { createProjectRepository } = await import('@/repositories/factory');
      vi.mocked(createProjectRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(null),
      } as never);

      const { GET } = await import('@/app/api/v1/generate/status/[projectId]/route');
      const res = await GET(
        new Request('https://app/api/v1/generate/status/99999999-9999-4999-a999-999999999999'),
        { params: Promise.resolve({ projectId: '99999999-9999-4999-a999-999999999999' }) },
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe('not_found');
    });
  });
});
