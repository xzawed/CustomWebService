import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('libsodium-wrappers', () => ({
  default: {
    ready: Promise.resolve(),
    from_base64: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
    from_string: vi.fn().mockReturnValue(new Uint8Array([4, 5, 6])),
    crypto_box_seal: vi.fn().mockReturnValue(new Uint8Array([7, 8, 9])),
    to_base64: vi.fn().mockReturnValue('encrypted-base64=='),
    base64_variants: { ORIGINAL: 1 },
  },
}));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.stubEnv('GITHUB_TOKEN', 'test-token');
  vi.stubEnv('GITHUB_ORG', 'test-org');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

// ── createRepository ──────────────────────────────────────────────────────────

describe('createRepository()', () => {
  it('성공 (200) → repoUrl과 fullName 반환', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ html_url: 'https://github.com/test-org/my-repo', full_name: 'test-org/my-repo' }),
    );

    const { createRepository } = await import('./githubService');
    const result = await createRepository('my-repo', 'test description');

    expect(result).toEqual({
      repoUrl: 'https://github.com/test-org/my-repo',
      fullName: 'test-org/my-repo',
    });
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/orgs/test-org/repos',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('422 "already exists" → 구성된 URL 반환 (fetch 재호출 없음)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: vi.fn().mockResolvedValue({ message: 'Repository creation failed: already exists.' }),
    });

    const { createRepository } = await import('./githubService');
    const result = await createRepository('my-repo');

    expect(result).toEqual({
      repoUrl: 'https://github.com/test-org/my-repo',
      fullName: 'test-org/my-repo',
    });
  });

  it('422이지만 already-exists 아닌 경우 → 에러 throw', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: vi.fn().mockResolvedValue({ message: 'Validation failed.' }),
    });

    const { createRepository } = await import('./githubService');
    await expect(createRepository('my-repo')).rejects.toThrow('GitHub repo creation failed: 422');
  });

  it('500 서버 에러 → GitHub repo creation failed: 500 throw', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ message: 'Internal Server Error' }),
    });

    const { createRepository } = await import('./githubService');
    await expect(createRepository('my-repo')).rejects.toThrow('GitHub repo creation failed: 500');
  });

  it('GITHUB_ORG 미설정 → "GITHUB_ORG is not set" throw', async () => {
    vi.stubEnv('GITHUB_ORG', '');

    const { createRepository } = await import('./githubService');
    await expect(createRepository('my-repo')).rejects.toThrow('GITHUB_ORG is not set');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('GITHUB_TOKEN 미설정 → "GITHUB_TOKEN is not set" throw', async () => {
    vi.stubEnv('GITHUB_ORG', 'test-org');
    vi.stubEnv('GITHUB_TOKEN', '');

    const { createRepository } = await import('./githubService');
    await expect(createRepository('my-repo')).rejects.toThrow('GITHUB_TOKEN is not set');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('description 미제공 시 auto-generated 설명 본문 포함', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ html_url: 'https://github.com/test-org/svc', full_name: 'test-org/svc' }),
    );

    const { createRepository } = await import('./githubService');
    await createRepository('svc');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(callBody.description).toBe('Auto-generated service: svc');
  });
});

// ── pushCode ──────────────────────────────────────────────────────────────────

describe('pushCode()', () => {
  const files = [{ path: 'index.html', content: '<html/>' }];

  it('전체 성공 → fetch 6회 호출 (ref→commit→blob×1→tree→commit→ref)', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({ object: { sha: 'abc123' } }))           // GET ref
      .mockResolvedValueOnce(mockResponse({ tree: { sha: 'tree123' } }))             // GET commit
      .mockResolvedValueOnce(mockResponse({ sha: 'blob1' }))                         // POST blob
      .mockResolvedValueOnce(mockResponse({ sha: 'newtree' }))                       // POST tree
      .mockResolvedValueOnce(mockResponse({ sha: 'newcommit' }))                     // POST commit
      .mockResolvedValueOnce(mockResponse({}));                                       // PATCH ref

    const { pushCode } = await import('./githubService');
    await expect(pushCode('test-org/my-repo', files)).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  it('파일 2개 → fetch 7회 (blob 2개)', async () => {
    const twoFiles = [
      { path: 'index.html', content: '<html/>' },
      { path: 'style.css', content: 'body {}' },
    ];
    mockFetch
      .mockResolvedValueOnce(mockResponse({ object: { sha: 'abc123' } }))
      .mockResolvedValueOnce(mockResponse({ tree: { sha: 'tree123' } }))
      .mockResolvedValueOnce(mockResponse({ sha: 'blob1' }))
      .mockResolvedValueOnce(mockResponse({ sha: 'blob2' }))
      .mockResolvedValueOnce(mockResponse({ sha: 'newtree' }))
      .mockResolvedValueOnce(mockResponse({ sha: 'newcommit' }))
      .mockResolvedValueOnce(mockResponse({}));

    const { pushCode } = await import('./githubService');
    await expect(pushCode('test-org/my-repo', twoFiles)).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(7);
  });

  it('ref 조회 실패 → "Failed to get ref" throw', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: vi.fn() });

    const { pushCode } = await import('./githubService');
    await expect(pushCode('test-org/my-repo', files)).rejects.toThrow('Failed to get ref: 404');
  });

  it('commit 조회 실패 → "Failed to get commit" throw', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({ object: { sha: 'abc123' } }))
      .mockResolvedValueOnce({ ok: false, status: 500, json: vi.fn() });

    const { pushCode } = await import('./githubService');
    await expect(pushCode('test-org/my-repo', files)).rejects.toThrow('Failed to get commit: 500');
  });

  it('blob 생성 실패 → "Failed to create blob" throw', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({ object: { sha: 'abc123' } }))
      .mockResolvedValueOnce(mockResponse({ tree: { sha: 'tree123' } }))
      .mockResolvedValueOnce({ ok: false, status: 422, json: vi.fn() });

    const { pushCode } = await import('./githubService');
    await expect(pushCode('test-org/my-repo', files)).rejects.toThrow('Failed to create blob');
  });

  it('tree 생성 실패 → "Failed to create tree" throw', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({ object: { sha: 'abc123' } }))
      .mockResolvedValueOnce(mockResponse({ tree: { sha: 'tree123' } }))
      .mockResolvedValueOnce(mockResponse({ sha: 'blob1' }))
      .mockResolvedValueOnce({ ok: false, status: 500, json: vi.fn() });

    const { pushCode } = await import('./githubService');
    await expect(pushCode('test-org/my-repo', files)).rejects.toThrow('Failed to create tree: 500');
  });

  it('commit 생성 실패 → "Failed to create commit" throw', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({ object: { sha: 'abc123' } }))
      .mockResolvedValueOnce(mockResponse({ tree: { sha: 'tree123' } }))
      .mockResolvedValueOnce(mockResponse({ sha: 'blob1' }))
      .mockResolvedValueOnce(mockResponse({ sha: 'newtree' }))
      .mockResolvedValueOnce({ ok: false, status: 500, json: vi.fn() });

    const { pushCode } = await import('./githubService');
    await expect(pushCode('test-org/my-repo', files)).rejects.toThrow('Failed to create commit: 500');
  });

  it('ref 업데이트 실패 → "Failed to update ref" throw', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({ object: { sha: 'abc123' } }))
      .mockResolvedValueOnce(mockResponse({ tree: { sha: 'tree123' } }))
      .mockResolvedValueOnce(mockResponse({ sha: 'blob1' }))
      .mockResolvedValueOnce(mockResponse({ sha: 'newtree' }))
      .mockResolvedValueOnce(mockResponse({ sha: 'newcommit' }))
      .mockResolvedValueOnce({ ok: false, status: 422, json: vi.fn() });

    const { pushCode } = await import('./githubService');
    await expect(pushCode('test-org/my-repo', files)).rejects.toThrow('Failed to update ref: 422');
  });
});

// ── setSecrets ────────────────────────────────────────────────────────────────

describe('setSecrets()', () => {
  it('빈 secrets {} → fetch 호출 없이 logger.info 호출 (early return)', async () => {
    const { setSecrets } = await import('./githubService');
    const { logger } = await import('@/lib/utils/logger');

    await expect(setSecrets('test-org/my-repo', {})).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Secrets configured', expect.objectContaining({ secretCount: 0 }));
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('non-empty secrets → public-key 조회 + PUT /actions/secrets/:name 호출', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({ key: 'base64key==', key_id: 'kid1' }))  // GET public-key
      .mockResolvedValueOnce({ ok: true, status: 204, json: vi.fn() })                // PUT API_KEY
      .mockResolvedValueOnce({ ok: true, status: 204, json: vi.fn() });               // PUT DB_URL

    const { setSecrets } = await import('./githubService');
    const { logger } = await import('@/lib/utils/logger');

    await setSecrets('test-org/my-repo', { API_KEY: 'secret-value', DB_URL: 'postgres://...' });

    // GET public-key + PUT 2개 = 3회 fetch
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/test-org/my-repo/actions/secrets/public-key',
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/actions/secrets/API_KEY'),
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Secrets configured', expect.objectContaining({ secretCount: 2 }));
  });

  it('PUT 응답 400 → logger.warn 기록 후 나머지 계속 진행', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({ key: 'base64key==', key_id: 'kid1' }))
      .mockResolvedValueOnce({ ok: false, status: 400, json: vi.fn() });

    const { setSecrets } = await import('./githubService');
    const { logger } = await import('@/lib/utils/logger');

    await expect(setSecrets('test-org/my-repo', { BAD_SECRET: 'val' })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to set secret', expect.objectContaining({ status: 400 }));
    expect(logger.info).toHaveBeenCalledWith('Secrets configured', expect.any(Object));
  });

  it('public-key 조회 실패 → logger.warn 후 early return (에러 throw 없음)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: vi.fn() });

    const { setSecrets } = await import('./githubService');
    const { logger } = await import('@/lib/utils/logger');

    await expect(setSecrets('test-org/my-repo', { KEY: 'val' })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to get public key for secrets',
      expect.objectContaining({ status: 403 }),
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});

// ── enableGithubPages ─────────────────────────────────────────────────────────

describe('enableGithubPages()', () => {
  it('성공 (201) → html_url 반환', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ html_url: 'https://test-org.github.io/my-repo/' }, 201),
    );

    const { enableGithubPages } = await import('./githubService');
    const result = await enableGithubPages('test-org/my-repo');

    expect(result).toBe('https://test-org.github.io/my-repo/');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('409 충돌 → GET /pages 재조회 후 기존 html_url 반환', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: vi.fn().mockResolvedValue({ message: 'Conflict' }),
      })
      .mockResolvedValueOnce(
        mockResponse({ html_url: 'https://test-org.github.io/my-repo/' }),
      );

    const { enableGithubPages } = await import('./githubService');
    const result = await enableGithubPages('test-org/my-repo');

    expect(result).toBe('https://test-org.github.io/my-repo/');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('409 충돌 + GET /pages도 실패 → "Failed to enable GitHub Pages" throw', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: vi.fn().mockResolvedValue({ message: 'Conflict' }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500, json: vi.fn() });

    const { enableGithubPages } = await import('./githubService');
    await expect(enableGithubPages('test-org/my-repo')).rejects.toThrow(
      'Failed to enable GitHub Pages: 409',
    );
  });

  it('500 에러 → "Failed to enable GitHub Pages: 500" throw', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ message: 'Internal Server Error' }),
    });

    const { enableGithubPages } = await import('./githubService');
    await expect(enableGithubPages('test-org/my-repo')).rejects.toThrow(
      'Failed to enable GitHub Pages: 500',
    );
  });

  it('branch/path 기본값 적용 확인 (main, /)', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ html_url: 'https://test-org.github.io/repo/' }, 201),
    );

    const { enableGithubPages } = await import('./githubService');
    await enableGithubPages('test-org/repo');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.source.branch).toBe('main');
    expect(body.source.path).toBe('/');
  });

  it('branch/path 커스텀 값 전달', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ html_url: 'https://test-org.github.io/repo/' }, 201),
    );

    const { enableGithubPages } = await import('./githubService');
    await enableGithubPages('test-org/repo', 'gh-pages', '/docs');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.source.branch).toBe('gh-pages');
    expect(body.source.path).toBe('/docs');
  });
});
