import { describe, it, expect, vi, beforeEach } from 'vitest';

// Auth mock — 라우트는 @/lib/auth/index 의 getAuthUser()를 사용한다.
vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

// Repository factory mock — 팩토리를 통째로 모킹하여 실제 SQLite 초기화 체인을 로드하지 않는다.
vi.mock('@/repositories/factory', () => ({
  createUserApiKeyRepository: vi.fn(),
  createCatalogRepository: vi.fn(),
}));

// Encryption mock — 암호화/복호화 호출을 스파이하고 복호화 실패 분기를 제어한다.
vi.mock('@/lib/encryption', () => ({
  encryptApiKey: vi.fn(),
  decryptApiKey: vi.fn(),
  maskApiKey: vi.fn(),
}));

const mockUser = { id: 'user-1', email: 'test@test.com', name: null, avatarUrl: null };
const API_ID = '550e8400-e29b-41d4-a716-446655440001';

function makeUserApiKeyRepo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    findAllByUser: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeCatalogRepo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    findById: vi.fn().mockResolvedValue({ id: API_ID, isActive: true }),
    ...overrides,
  };
}

async function setAuth(user: typeof mockUser | null): Promise<void> {
  const { getAuthUser } = await import('@/lib/auth/index');
  vi.mocked(getAuthUser).mockResolvedValue(user);
}

// ────────────────────────────────────────────────────────────────
// GET /api/v1/user-api-keys
// ────────────────────────────────────────────────────────────────
describe('GET /api/v1/user-api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401을 반환한다', async () => {
    await setAuth(null);

    const { GET } = await import('@/app/api/v1/user-api-keys/route');
    const res = await GET();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  it('저장된 키 목록을 마스킹하여 반환한다', async () => {
    await setAuth(mockUser);

    const row = {
      id: 'key-1',
      apiId: API_ID,
      encryptedKey: 'iv:tag:cipher',
      isVerified: true,
      verifiedAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-06-01T00:00:00.000Z',
    };
    const { createUserApiKeyRepository } = await import('@/repositories/factory');
    vi.mocked(createUserApiKeyRepository).mockReturnValue(
      makeUserApiKeyRepo({ findAllByUser: vi.fn().mockResolvedValue([row]) }) as never
    );

    const { decryptApiKey, maskApiKey } = await import('@/lib/encryption');
    vi.mocked(decryptApiKey).mockReturnValue('sk-live-secret');
    vi.mocked(maskApiKey).mockReturnValue('sk-l****');

    const { GET } = await import('@/app/api/v1/user-api-keys/route');
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toEqual({
      id: 'key-1',
      apiId: API_ID,
      maskedKey: 'sk-l****',
      isVerified: true,
      verifiedAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-06-01T00:00:00.000Z',
    });
    // 원문 키(평문)는 응답에 절대 노출되지 않는다.
    expect(vi.mocked(decryptApiKey)).toHaveBeenCalledWith('iv:tag:cipher');
    expect(JSON.stringify(body)).not.toContain('sk-live-secret');
  });

  it('복호화 실패 시 마스킹된 기본값 ****로 폴백한다', async () => {
    await setAuth(mockUser);

    const row = {
      id: 'key-1',
      apiId: API_ID,
      encryptedKey: 'corrupted',
      isVerified: false,
      verifiedAt: null,
      createdAt: '2026-06-01T00:00:00.000Z',
    };
    const { createUserApiKeyRepository } = await import('@/repositories/factory');
    vi.mocked(createUserApiKeyRepository).mockReturnValue(
      makeUserApiKeyRepo({ findAllByUser: vi.fn().mockResolvedValue([row]) }) as never
    );

    const { decryptApiKey } = await import('@/lib/encryption');
    vi.mocked(decryptApiKey).mockImplementation(() => {
      throw new Error('잘못된 암호화 형식입니다.');
    });

    const { GET } = await import('@/app/api/v1/user-api-keys/route');
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].maskedKey).toBe('****');
  });

  it('저장된 키가 없으면 빈 배열을 반환한다', async () => {
    await setAuth(mockUser);

    const { createUserApiKeyRepository } = await import('@/repositories/factory');
    vi.mocked(createUserApiKeyRepository).mockReturnValue(makeUserApiKeyRepo() as never);

    const { GET } = await import('@/app/api/v1/user-api-keys/route');
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('본인(userId)으로만 조회가 스코프된다', async () => {
    await setAuth(mockUser);

    const findAllByUser = vi.fn().mockResolvedValue([]);
    const { createUserApiKeyRepository } = await import('@/repositories/factory');
    vi.mocked(createUserApiKeyRepository).mockReturnValue(
      makeUserApiKeyRepo({ findAllByUser }) as never
    );

    const { GET } = await import('@/app/api/v1/user-api-keys/route');
    await GET();

    expect(findAllByUser).toHaveBeenCalledWith('user-1');
  });
});

// ────────────────────────────────────────────────────────────────
// POST /api/v1/user-api-keys
// ────────────────────────────────────────────────────────────────
describe('POST /api/v1/user-api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  function postRequest(body: unknown): Request {
    return new Request('http://localhost/api/v1/user-api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('비로그인 시 401을 반환한다', async () => {
    await setAuth(null);

    const { POST } = await import('@/app/api/v1/user-api-keys/route');
    const res = await POST(postRequest({ apiId: API_ID, apiKey: 'secret' }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  it('본문이 JSON이 아니면 400을 반환한다', async () => {
    await setAuth(mockUser);

    const { POST } = await import('@/app/api/v1/user-api-keys/route');
    const res = await POST(postRequest('not-json{'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('apiKey가 빈 문자열이면 400을 반환한다', async () => {
    await setAuth(mockUser);

    const { POST } = await import('@/app/api/v1/user-api-keys/route');
    const res = await POST(postRequest({ apiId: API_ID, apiKey: '' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('apiId가 UUID가 아니면 400을 반환한다', async () => {
    await setAuth(mockUser);

    const { POST } = await import('@/app/api/v1/user-api-keys/route');
    const res = await POST(postRequest({ apiId: 'not-a-uuid', apiKey: 'secret' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('존재하지 않는 API면 404를 반환한다', async () => {
    await setAuth(mockUser);

    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue(
      makeCatalogRepo({ findById: vi.fn().mockResolvedValue(null) }) as never
    );

    const { POST } = await import('@/app/api/v1/user-api-keys/route');
    const res = await POST(postRequest({ apiId: API_ID, apiKey: 'secret' }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('비활성 API면 404를 반환한다', async () => {
    await setAuth(mockUser);

    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue(
      makeCatalogRepo({ findById: vi.fn().mockResolvedValue({ id: API_ID, isActive: false }) }) as never
    );

    const { POST } = await import('@/app/api/v1/user-api-keys/route');
    const res = await POST(postRequest({ apiId: API_ID, apiKey: 'secret' }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('정상 요청 시 키를 암호화하여 저장하고 200을 반환한다', async () => {
    await setAuth(mockUser);

    const { createCatalogRepository, createUserApiKeyRepository } = await import(
      '@/repositories/factory'
    );
    vi.mocked(createCatalogRepository).mockReturnValue(makeCatalogRepo() as never);

    const upsert = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createUserApiKeyRepository).mockReturnValue(
      makeUserApiKeyRepo({ upsert }) as never
    );

    const { encryptApiKey } = await import('@/lib/encryption');
    vi.mocked(encryptApiKey).mockReturnValue('iv:tag:cipher');

    const { POST } = await import('@/app/api/v1/user-api-keys/route');
    const res = await POST(postRequest({ apiId: API_ID, apiKey: '  secret-key  ' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toBeTruthy();

    // 저장 전 trim된 평문으로 암호화가 호출된다.
    expect(vi.mocked(encryptApiKey)).toHaveBeenCalledWith('secret-key');
    // 암호화 결과가 본인 userId·apiId와 함께 저장된다.
    expect(upsert).toHaveBeenCalledWith('user-1', API_ID, 'iv:tag:cipher');
  });

  it('암호화가 실패하면 500을 반환한다', async () => {
    await setAuth(mockUser);

    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue(makeCatalogRepo() as never);

    const { encryptApiKey } = await import('@/lib/encryption');
    vi.mocked(encryptApiKey).mockImplementation(() => {
      throw new Error('ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.');
    });

    const { POST } = await import('@/app/api/v1/user-api-keys/route');
    const res = await POST(postRequest({ apiId: API_ID, apiKey: 'secret' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('공백만 있는 apiKey는 400으로 거부되고 빈 문자열이 저장되지 않는다', async () => {
    await setAuth(mockUser);

    const { createCatalogRepository, createUserApiKeyRepository } = await import(
      '@/repositories/factory'
    );
    vi.mocked(createCatalogRepository).mockReturnValue(makeCatalogRepo() as never);

    const upsert = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createUserApiKeyRepository).mockReturnValue(
      makeUserApiKeyRepo({ upsert }) as never
    );

    const { encryptApiKey } = await import('@/lib/encryption');

    const { POST } = await import('@/app/api/v1/user-api-keys/route');
    // saveKeySchema가 trim() 후 min(1)을 적용하므로 '   '는 스키마 단계에서 거부된다.
    const res = await POST(postRequest({ apiId: API_ID, apiKey: '   ' }));

    expect(res.status).toBe(400);
    expect(vi.mocked(encryptApiKey)).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('앞뒤 공백이 있는 apiKey는 trim된 값으로 암호화된다', async () => {
    await setAuth(mockUser);

    const { createCatalogRepository, createUserApiKeyRepository } = await import(
      '@/repositories/factory'
    );
    vi.mocked(createCatalogRepository).mockReturnValue(makeCatalogRepo() as never);
    vi.mocked(createUserApiKeyRepository).mockReturnValue(makeUserApiKeyRepo() as never);

    const { encryptApiKey } = await import('@/lib/encryption');
    vi.mocked(encryptApiKey).mockReturnValue('iv:tag:cipher');

    const { POST } = await import('@/app/api/v1/user-api-keys/route');
    const res = await POST(postRequest({ apiId: API_ID, apiKey: '  sk-live-abc  ' }));

    expect(res.status).toBe(200);
    expect(vi.mocked(encryptApiKey)).toHaveBeenCalledWith('sk-live-abc');
  });
});

// ────────────────────────────────────────────────────────────────
// DELETE /api/v1/user-api-keys
// ────────────────────────────────────────────────────────────────
describe('DELETE /api/v1/user-api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  function deleteRequest(apiId?: string): Request {
    const url = apiId
      ? `http://localhost/api/v1/user-api-keys?apiId=${apiId}`
      : 'http://localhost/api/v1/user-api-keys';
    return new Request(url, { method: 'DELETE' });
  }

  it('비로그인 시 401을 반환한다', async () => {
    await setAuth(null);

    const { DELETE } = await import('@/app/api/v1/user-api-keys/route');
    const res = await DELETE(deleteRequest(API_ID));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  it('apiId 쿼리가 없으면 400을 반환한다', async () => {
    await setAuth(mockUser);

    const { DELETE } = await import('@/app/api/v1/user-api-keys/route');
    const res = await DELETE(deleteRequest());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('apiId가 UUID가 아니면 400을 반환한다', async () => {
    await setAuth(mockUser);

    const { DELETE } = await import('@/app/api/v1/user-api-keys/route');
    const res = await DELETE(deleteRequest('not-a-uuid'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('정상 요청 시 본인(userId)·apiId로 스코프하여 삭제하고 200을 반환한다', async () => {
    await setAuth(mockUser);

    const del = vi.fn().mockResolvedValue(undefined);
    const { createUserApiKeyRepository } = await import('@/repositories/factory');
    vi.mocked(createUserApiKeyRepository).mockReturnValue(
      makeUserApiKeyRepo({ delete: del }) as never
    );

    const { DELETE } = await import('@/app/api/v1/user-api-keys/route');
    const res = await DELETE(deleteRequest(API_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // 삭제는 항상 인증된 사용자 본인 id로 스코프되어 타인 키는 건드릴 수 없다.
    expect(del).toHaveBeenCalledWith('user-1', API_ID);
  });
});
