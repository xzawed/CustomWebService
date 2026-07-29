import { describe, it, expect, vi, beforeEach } from 'vitest';

const VALID_ADMIN_KEY = 'test-admin-secret-key';
const VALID_USER_ID = '6890346f-fa79-483c-bce2-f841ad3420fd';
const API_ID_1 = '04e79764-c27c-46d8-b63c-2794fbe5a3f7';
const API_ID_2 = '02cea7ab-d89a-4e51-b9c5-32ed0fd00338';
const API_ID_3 = '9a04cd18-15bb-4424-a4f1-10ddf728749b';

const mockCreatedProject = {
  id: 'aaaaaaaa-1111-1111-1111-111111111111',
  userId: VALID_USER_ID,
  organizationId: null,
  name: '[자동테스트] 2026-05-21 00:00:00',
  context: 'test context',
  status: 'draft' as const,
  slug: null,
  deployUrl: null,
  deployPlatform: null,
  repoUrl: null,
  previewUrl: null,
  metadata: { test: true },
  currentVersion: 0,
  apis: [],
  publishedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const projectRepoMock = {
  create: vi.fn().mockResolvedValue(mockCreatedProject),
  insertProjectApis: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  findById: vi.fn().mockResolvedValue(mockCreatedProject),
  updateStatus: vi.fn().mockResolvedValue(mockCreatedProject),
};

const catalogServiceMock = {
  getByIds: vi.fn().mockResolvedValue([
    { id: API_ID_1, name: 'API 1' },
    { id: API_ID_2, name: 'API 2' },
    { id: API_ID_3, name: 'API 3' },
  ]),
};

vi.mock('@/services/factory', () => ({
  createCatalogService: vi.fn(() => catalogServiceMock),
  createProjectService: vi.fn(() => ({ updateStatus: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('@/repositories/factory', () => ({
  createCodeRepository: vi.fn(() => ({})),
  createProjectRepository: vi.fn(() => projectRepoMock),
}));

// 라우트가 락을 획득하고 파이프라인(모킹됨)이 해제한다 — 짝을 맞추지 않으면
// heartbeat가 없는 락을 갱신하려다 매번 경고가 남는다.
vi.mock('@/lib/ai/generationLock', () => ({
  acquireGenerationLock: vi.fn().mockResolvedValue(true),
  releaseGenerationLock: vi.fn().mockResolvedValue(undefined),
  startLockHeartbeat: vi.fn().mockReturnValue(() => {}),
}));

vi.mock('@/lib/ai/promptBuilder', () => ({
  buildStage1SystemPrompt: vi.fn(() => 'sys1'),
  buildStage1UserPrompt: vi.fn(() => 'user1'),
  buildStage2SystemPrompt: vi.fn(() => 'sys2'),
  buildStage2UserPrompt: vi.fn(() => 'user2'),
  buildStage2FunctionSystemPrompt: vi.fn(() => 'sys2fn'),
  buildStage2FunctionUserPrompt: vi.fn(() => 'user2fn'),
}));

const pipelineMock = vi.fn();
vi.mock('@/lib/ai/generationPipeline', () => ({
  runGenerationPipeline: pipelineMock,
}));

function makeRequest(body: unknown, key: string | null = VALID_ADMIN_KEY) {
  const headers: Record<string, string> = { 'x-real-ip': '127.0.0.1', 'Content-Type': 'application/json' };
  if (key !== null) headers['Authorization'] = `Bearer ${key}`;
  return new Request('http://localhost/api/v1/admin/test-generation', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/admin/test-generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
    projectRepoMock.create.mockResolvedValue(mockCreatedProject);
    projectRepoMock.insertProjectApis.mockResolvedValue(undefined);
    projectRepoMock.delete.mockResolvedValue(undefined);
    catalogServiceMock.getByIds.mockResolvedValue([
      { id: API_ID_1 },
      { id: API_ID_2 },
      { id: API_ID_3 },
    ]);
  });

  it('Authorization 헤더 없음 → 403', async () => {
    const { POST } = await import('@/app/api/v1/admin/test-generation/route');
    const res = await POST(makeRequest({ userId: VALID_USER_ID, apiIds: [API_ID_1, API_ID_2, API_ID_3] }, null));
    expect(res.status).toBe(403);
  });

  it('잘못된 admin 키 → 403', async () => {
    const { POST } = await import('@/app/api/v1/admin/test-generation/route');
    const res = await POST(makeRequest({ userId: VALID_USER_ID, apiIds: [API_ID_1, API_ID_2, API_ID_3] }, 'bad-key'));
    expect(res.status).toBe(403);
  });

  it('apiIds 3개 미만 → 400/422', async () => {
    const { POST } = await import('@/app/api/v1/admin/test-generation/route');
    const res = await POST(makeRequest({ userId: VALID_USER_ID, apiIds: [API_ID_1, API_ID_2] }));
    expect([400, 422]).toContain(res.status);
  });

  it('userId 누락 → 400/422', async () => {
    const { POST } = await import('@/app/api/v1/admin/test-generation/route');
    const res = await POST(makeRequest({ apiIds: [API_ID_1, API_ID_2, API_ID_3] }));
    expect([400, 422]).toContain(res.status);
  });

  it('파이프라인 complete 이벤트 → success: true', async () => {
    pipelineMock.mockImplementation(async (_input, sse) => {
      sse.send('progress', { step: 'analyzing', progress: 5 });
      sse.send('complete', { projectId: mockCreatedProject.id, version: 1, previewUrl: '/api/v1/preview/x' });
    });
    const { POST } = await import('@/app/api/v1/admin/test-generation/route');
    const res = await POST(makeRequest({ userId: VALID_USER_ID, apiIds: [API_ID_1, API_ID_2, API_ID_3] }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.projectId).toBe(mockCreatedProject.id);
    expect(body.data.complete).toMatchObject({ version: 1 });
    expect(body.data.cleanedUp).toBe(true);
    expect(projectRepoMock.delete).toHaveBeenCalledWith(mockCreatedProject.id);
  });

  it('파이프라인 error 이벤트 → success: false (HTTP 200)', async () => {
    pipelineMock.mockImplementation(async (_input, sse) => {
      sse.send('error', { message: 'Stage 1 실패' });
    });
    const { POST } = await import('@/app/api/v1/admin/test-generation/route');
    const res = await POST(makeRequest({ userId: VALID_USER_ID, apiIds: [API_ID_1, API_ID_2, API_ID_3] }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.data.error).toMatchObject({ message: 'Stage 1 실패' });
  });

  it('cleanup: false → 프로젝트 삭제 안 함', async () => {
    pipelineMock.mockImplementation(async (_input, sse) => {
      sse.send('complete', { projectId: mockCreatedProject.id, version: 1 });
    });
    const { POST } = await import('@/app/api/v1/admin/test-generation/route');
    const res = await POST(
      makeRequest({ userId: VALID_USER_ID, apiIds: [API_ID_1, API_ID_2, API_ID_3], cleanup: false }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cleanedUp).toBe(false);
    expect(projectRepoMock.delete).not.toHaveBeenCalled();
  });

  // 삭제 실패를 삼키고 cleanedUp:true 를 내보내면 운영에서 고아 프로젝트를 못 본다
  it('delete 실패 시에도 200이며 cleanedUp은 false다', async () => {
    pipelineMock.mockImplementation(async (_input, sse) => {
      sse.send('complete', { projectId: mockCreatedProject.id, version: 1 });
    });
    projectRepoMock.delete.mockRejectedValue(new Error('FK constraint failed'));

    const { POST } = await import('@/app/api/v1/admin/test-generation/route');
    const res = await POST(
      makeRequest({ userId: VALID_USER_ID, apiIds: [API_ID_1, API_ID_2, API_ID_3] }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.cleanedUp).toBe(false);
    expect(projectRepoMock.delete).toHaveBeenCalledWith(mockCreatedProject.id);
  });

  it('파이프라인 throw → handleApiError + 생성된 프로젝트 cleanup', async () => {
    pipelineMock.mockRejectedValue(new Error('Pipeline crashed'));
    const { POST } = await import('@/app/api/v1/admin/test-generation/route');
    const res = await POST(makeRequest({ userId: VALID_USER_ID, apiIds: [API_ID_1, API_ID_2, API_ID_3] }));

    expect([400, 500]).toContain(res.status);
    expect(projectRepoMock.delete).toHaveBeenCalledWith(mockCreatedProject.id);
  });

  it('OPTIONS preflight → 204', async () => {
    const { OPTIONS } = await import('@/app/api/v1/admin/test-generation/route');
    const res = await OPTIONS();
    expect([200, 204]).toContain(res.status);
  });
});
