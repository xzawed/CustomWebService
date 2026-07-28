import { describe, it, expect, vi } from 'vitest';
import { resolveProxyContext, extractSiteSlug, type ProxyContextDeps } from './resolveProxyContext';
import type { Project } from '@/types/project';

const API_ID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';
const OTHER_API_ID = '11112222-3333-4444-5555-666677778888';

function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    userId: 'owner-1',
    organizationId: null,
    name: 'p',
    context: 'c',
    status: 'published',
    deployUrl: null,
    deployPlatform: null,
    repoUrl: null,
    previewUrl: null,
    metadata: {},
    currentVersion: 1,
    apis: [],
    slug: 'weather',
    publishedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as Project;
}

/** 각 의존성을 vi.fn으로 노출해 호출 여부까지 단언할 수 있게 한다. */
type MockedDeps = {
  getAuthUser: ReturnType<typeof vi.fn>;
  findProjectBySlug: ReturnType<typeof vi.fn>;
  findProjectById: ReturnType<typeof vi.fn>;
  getProjectApiIds: ReturnType<typeof vi.fn>;
  rootDomain: string | undefined;
};

function makeDeps(over: Partial<MockedDeps> = {}): MockedDeps {
  return {
    getAuthUser: vi.fn(async () => null),
    findProjectBySlug: vi.fn(async () => makeProject()),
    findProjectById: vi.fn(async () => makeProject()),
    getProjectApiIds: vi.fn(async () => [API_ID]),
    rootDomain: 'xzawed.xyz',
    ...over,
  };
}

function call(deps: MockedDeps, url: string, host: string, apiId = API_ID) {
  return resolveProxyContext(
    new Request(url, { headers: { host } }),
    apiId,
    deps as unknown as ProxyContextDeps,
  );
}

describe('extractSiteSlug', () => {
  it('서브도메인에서 slug를 뽑는다', () => {
    expect(extractSiteSlug('weather.xzawed.xyz', 'xzawed.xyz')).toBe('weather');
  });

  it('대문자 호스트도 정규화해 처리한다', () => {
    expect(extractSiteSlug('Weather.XZAWED.xyz', 'xzawed.xyz')).toBe('weather');
  });

  it('포트가 붙어도 처리한다', () => {
    expect(extractSiteSlug('weather.xzawed.xyz:3000', 'xzawed.xyz')).toBe('weather');
  });

  it('apex는 null', () => {
    expect(extractSiteSlug('xzawed.xyz', 'xzawed.xyz')).toBeNull();
  });

  it('예약 slug(www)는 null', () => {
    expect(extractSiteSlug('www.xzawed.xyz', 'xzawed.xyz')).toBeNull();
  });

  it('localhost는 null (개발 환경)', () => {
    expect(extractSiteSlug('weather.localhost', 'localhost')).toBeNull();
  });

  it('rootDomain 미설정이면 null', () => {
    expect(extractSiteSlug('weather.xzawed.xyz', undefined)).toBeNull();
  });
});

describe('resolveProxyContext — site 모드 (익명)', () => {
  it('published 서브도메인 → site 모드, 프로젝트는 Host에서 확정', async () => {
    const deps = makeDeps();
    const ctx = await call(deps, 'https://weather.xzawed.xyz/api/v1/proxy', 'weather.xzawed.xyz');
    expect(ctx).toMatchObject({ mode: 'site' });
    expect((ctx as { project: Project }).project.userId).toBe('owner-1');
  });

  it('Host가 있으면 클라이언트 projectId는 무시된다', async () => {
    const deps = makeDeps();
    await call(
      deps,
      'https://weather.xzawed.xyz/api/v1/proxy?projectId=attacker-proj',
      'weather.xzawed.xyz',
    );
    expect(deps.findProjectBySlug).toHaveBeenCalledWith('weather');
    expect(deps.findProjectById).not.toHaveBeenCalled();
  });

  it('미게시 프로젝트의 서브도메인 → 404', async () => {
    const deps = makeDeps({
      findProjectBySlug: vi.fn(async () => makeProject({ status: 'draft' })),
    });
    const ctx = await call(deps, 'https://weather.xzawed.xyz/api/v1/proxy', 'weather.xzawed.xyz');
    expect(ctx).toMatchObject({ error: { status: 404 } });
  });

  it('존재하지 않는 slug → 404 (부재와 미게시를 구분해 노출하지 않음)', async () => {
    const deps = makeDeps({ findProjectBySlug: vi.fn(async () => null) });
    const ctx = await call(deps, 'https://nope.xzawed.xyz/api/v1/proxy', 'nope.xzawed.xyz');
    expect(ctx).toMatchObject({ error: { status: 404 } });
  });

  it('apex + 세션 없음 + published projectId → site 모드 (직접 게시 URL 경로)', async () => {
    const deps = makeDeps();
    const ctx = await call(deps, 'https://xzawed.xyz/api/v1/proxy?projectId=proj-1', 'xzawed.xyz');
    expect(ctx).toMatchObject({ mode: 'site' });
  });

  it('apex + 세션 없음 + 미게시 projectId → 404', async () => {
    const deps = makeDeps({
      findProjectById: vi.fn(async () => makeProject({ status: 'draft' })),
    });
    const ctx = await call(deps, 'https://xzawed.xyz/api/v1/proxy?projectId=proj-1', 'xzawed.xyz');
    expect(ctx).toMatchObject({ error: { status: 404 } });
  });

  it('apex + 세션 없음 + projectId 없음 → 401', async () => {
    const deps = makeDeps();
    const ctx = await call(deps, 'https://xzawed.xyz/api/v1/proxy', 'xzawed.xyz');
    expect(ctx).toMatchObject({ error: { status: 401 } });
  });

  it('site 모드에서 프로젝트에 연결되지 않은 apiId → 403', async () => {
    const deps = makeDeps();
    const ctx = await call(
      deps,
      'https://weather.xzawed.xyz/api/v1/proxy',
      'weather.xzawed.xyz',
      OTHER_API_ID,
    );
    expect(ctx).toMatchObject({ error: { status: 403 } });
  });

  it('예약 slug(www)는 서브도메인 사이트로 보지 않는다', async () => {
    const deps = makeDeps();
    const ctx = await call(deps, 'https://www.xzawed.xyz/api/v1/proxy', 'www.xzawed.xyz');
    expect(ctx).toMatchObject({ error: { status: 401 } });
    expect(deps.findProjectBySlug).not.toHaveBeenCalled();
  });
});

describe('resolveProxyContext — app 모드 (세션)', () => {
  const user = { id: 'owner-1', email: 'o@x.com', name: null, avatarUrl: null };

  it('세션 + 자기 projectId → app 모드', async () => {
    const deps = makeDeps({ getAuthUser: vi.fn(async () => user) });
    const ctx = await call(deps, 'https://xzawed.xyz/api/v1/proxy?projectId=proj-1', 'xzawed.xyz');
    expect(ctx).toMatchObject({ mode: 'app' });
  });

  it('세션 + 타인 projectId → 403 (H-1 회귀 방지)', async () => {
    const deps = makeDeps({
      getAuthUser: vi.fn(async () => ({ ...user, id: 'attacker' })),
      findProjectById: vi.fn(async () => makeProject({ userId: 'victim' })),
    });
    const ctx = await call(deps, 'https://xzawed.xyz/api/v1/proxy?projectId=proj-1', 'xzawed.xyz');
    expect(ctx).toMatchObject({ error: { status: 403 } });
  });

  it('타인 projectId면 연결 API 조회조차 하지 않는다 (소유권이 먼저)', async () => {
    const deps = makeDeps({
      getAuthUser: vi.fn(async () => ({ ...user, id: 'attacker' })),
      findProjectById: vi.fn(async () => makeProject({ userId: 'victim' })),
    });
    await call(deps, 'https://xzawed.xyz/api/v1/proxy?projectId=proj-1', 'xzawed.xyz');
    expect(deps.getProjectApiIds).not.toHaveBeenCalled();
  });

  it('세션 + projectId 없음 → app 모드, project는 null (플랫폼 키만 사용)', async () => {
    const deps = makeDeps({ getAuthUser: vi.fn(async () => user) });
    const ctx = await call(deps, 'https://xzawed.xyz/api/v1/proxy', 'xzawed.xyz');
    expect(ctx).toMatchObject({ mode: 'app', project: null });
  });

  it('세션 + 자기 프로젝트지만 연결되지 않은 apiId → 403', async () => {
    const deps = makeDeps({ getAuthUser: vi.fn(async () => user) });
    const ctx = await call(
      deps,
      'https://xzawed.xyz/api/v1/proxy?projectId=proj-1',
      'xzawed.xyz',
      OTHER_API_ID,
    );
    expect(ctx).toMatchObject({ error: { status: 403 } });
  });

  it('세션 + 존재하지 않는 projectId → 404', async () => {
    const deps = makeDeps({
      getAuthUser: vi.fn(async () => user),
      findProjectById: vi.fn(async () => null),
    });
    const ctx = await call(deps, 'https://xzawed.xyz/api/v1/proxy?projectId=nope', 'xzawed.xyz');
    expect(ctx).toMatchObject({ error: { status: 404 } });
  });
});
