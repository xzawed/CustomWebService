import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeployService } from './deployService';
import { NotFoundError, ValidationError, ForbiddenError } from '@/lib/utils/errors';
import type { IProjectRepository, ICodeRepository } from '@/repositories/interfaces';

vi.mock('@/providers/deploy/DeployProviderFactory', () => ({
  DeployProviderFactory: {
    create: vi.fn(),
  },
}));

vi.mock('@/lib/ai/codeParser', () => ({
  assembleHtml: vi.fn().mockReturnValue('<!DOCTYPE html><html><body></body></html>'),
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('@/lib/auth/authorize', () => ({
  assertOwner: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockProject = {
  id: 'proj-1',
  userId: 'user-1',
  name: '테스트 프로젝트',
  status: 'generated' as const,
};

const mockCode = {
  id: 'code-1',
  projectId: 'proj-1',
  version: 1,
  codeHtml: '<div>Hello</div>',
  codeCss: 'div{}',
  codeJs: '',
};

function makeRepos(overrides?: {
  project?: Partial<typeof mockProject> | null;
  code?: typeof mockCode | null;
}) {
  const projectRepo: IProjectRepository = {
    findById: vi.fn().mockResolvedValue(overrides?.project === undefined ? mockProject : overrides.project),
    findByUserId: vi.fn(),
    findBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn().mockResolvedValue(mockProject),
    delete: vi.fn(),
    getProjectApiIds: vi.fn(),
    setProjectApiIds: vi.fn(),
  } as unknown as IProjectRepository;

  const codeRepo: ICodeRepository = {
    findByProject: vi.fn().mockResolvedValue(overrides?.code === undefined ? mockCode : overrides.code),
    getNextVersion: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    pruneOldVersions: vi.fn(),
  } as unknown as ICodeRepository;

  return { projectRepo, codeRepo };
}

function makeDeployProvider(status: 'success' | 'error' = 'success') {
  return {
    createProject: vi.fn().mockResolvedValue({ projectId: 'deploy-proj-1', repoUrl: 'https://github.com/test/repo' }),
    pushFiles: vi.fn().mockResolvedValue(undefined),
    setEnvironment: vi.fn().mockResolvedValue(undefined),
    deploy: vi.fn().mockResolvedValue({
      status,
      url: status === 'success' ? 'https://deploy.example.com' : undefined,
    }),
  };
}

describe('DeployService.deploy()', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('존재하지 않는 프로젝트면 NotFoundError를 던진다', async () => {
    const { projectRepo, codeRepo } = makeRepos({ project: null });
    const service = new DeployService(projectRepo, codeRepo);

    await expect(service.deploy('proj-999', 'user-1')).rejects.toThrow(NotFoundError);
  });

  it('타인 프로젝트면 assertOwner를 통해 ForbiddenError를 던진다', async () => {
    const { assertOwner } = await import('@/lib/auth/authorize');
    vi.mocked(assertOwner).mockImplementation(() => { throw new ForbiddenError(); });

    const { projectRepo, codeRepo } = makeRepos();
    const service = new DeployService(projectRepo, codeRepo);

    await expect(service.deploy('proj-1', 'other-user')).rejects.toThrow(ForbiddenError);
  });

  it('생성된 코드가 없으면 ValidationError를 던진다', async () => {
    const { projectRepo, codeRepo } = makeRepos({ code: null });
    const service = new DeployService(projectRepo, codeRepo);

    await expect(service.deploy('proj-1', 'user-1')).rejects.toThrow(ValidationError);
  });

  it('정상 배포 시 deployUrl을 반환하고 status를 deployed로 업데이트한다', async () => {
    const { DeployProviderFactory } = await import('@/providers/deploy/DeployProviderFactory');
    vi.mocked(DeployProviderFactory.create).mockReturnValue(makeDeployProvider() as never);

    const { projectRepo, codeRepo } = makeRepos();
    const service = new DeployService(projectRepo, codeRepo);

    const result = await service.deploy('proj-1', 'user-1');

    expect(result.deployUrl).toBe('https://deploy.example.com');
    expect(projectRepo.update).toHaveBeenCalledWith('proj-1', expect.objectContaining({ status: 'deployed' }));
  });

  it('정상 배포 시 DEPLOYMENT_STARTED + DEPLOYMENT_COMPLETED 이벤트가 발행된다', async () => {
    const { DeployProviderFactory } = await import('@/providers/deploy/DeployProviderFactory');
    vi.mocked(DeployProviderFactory.create).mockReturnValue(makeDeployProvider() as never);

    const { eventBus } = await import('@/lib/events/eventBus');
    const { projectRepo, codeRepo } = makeRepos();
    const service = new DeployService(projectRepo, codeRepo);

    await service.deploy('proj-1', 'user-1');

    expect(eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'DEPLOYMENT_STARTED' }));
    expect(eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'DEPLOYMENT_COMPLETED' }));
  });

  it('배포 실패 시 이전 status를 복원하고 DEPLOYMENT_FAILED 이벤트를 발행한다', async () => {
    const { DeployProviderFactory } = await import('@/providers/deploy/DeployProviderFactory');
    vi.mocked(DeployProviderFactory.create).mockReturnValue(makeDeployProvider('error') as never);

    const { eventBus } = await import('@/lib/events/eventBus');
    const { projectRepo, codeRepo } = makeRepos();
    const service = new DeployService(projectRepo, codeRepo);

    await expect(service.deploy('proj-1', 'user-1')).rejects.toThrow();

    // Status must be restored to previous value ('generated')
    expect(projectRepo.update).toHaveBeenCalledWith('proj-1', expect.objectContaining({ status: 'generated' }));
    expect(eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'DEPLOYMENT_FAILED' }));
  });

  it('onProgress 콜백이 여러 단계에서 호출된다', async () => {
    const { DeployProviderFactory } = await import('@/providers/deploy/DeployProviderFactory');
    vi.mocked(DeployProviderFactory.create).mockReturnValue(makeDeployProvider() as never);

    const { projectRepo, codeRepo } = makeRepos();
    const service = new DeployService(projectRepo, codeRepo);
    const onProgress = vi.fn();

    await service.deploy('proj-1', 'user-1', 'railway', onProgress);

    expect(onProgress).toHaveBeenCalledWith(10, expect.any(String));
    expect(onProgress).toHaveBeenCalledWith(expect.any(Number), expect.any(String));
  });
});
