import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerationService } from './generationService';
import { RateLimitService } from './rateLimitService';
import { RateLimitError, NotFoundError, ForbiddenError } from '@/lib/utils/errors';
import type {
  IProjectRepository,
  ICatalogRepository,
  ICodeRepository,
  IRateLimitRepository,
} from '@/repositories/interfaces';

vi.mock('@/providers/ai/AiProviderFactory', () => {
  const provider = {
    generateCode: vi.fn().mockResolvedValue({
      content:
        '```html\n<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"><title>Test</title></head><body><p>test</p></body></html>\n```\n```css\nbody{}\n```\n```javascript\nconst x=1\n```',
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      durationMs: 1000,
      tokensUsed: { prompt: 100, completion: 200 },
    }),
  };
  return {
    AiProviderFactory: {
      create: vi.fn().mockReturnValue(provider),
      createForTask: vi.fn().mockReturnValue(provider),
    },
  };
});

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

function makeProjectRepo(): IProjectRepository {
  return {
    findById: vi.fn(),
    getProjectApiIds: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
    findByUserId: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    insertProjectApis: vi.fn(),
    countTodayGenerations: vi.fn(),
    findBySlug: vi.fn(),
    updateSlug: vi.fn(),
  } as unknown as IProjectRepository;
}

function makeCatalogRepo(): ICatalogRepository {
  return {
    findByIds: vi.fn(),
    search: vi.fn(),
    getCategories: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  } as unknown as ICatalogRepository;
}

function makeCodeRepo(): ICodeRepository {
  return {
    getNextVersion: vi.fn(),
    create: vi.fn(),
    findByProject: vi.fn(),
    countByProject: vi.fn(),
    pruneOldVersions: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  } as unknown as ICodeRepository;
}

function makeRateLimitRepo(allowed: boolean): IRateLimitRepository {
  return {
    checkAndIncrementDailyLimit: vi.fn().mockResolvedValue(allowed),
    decrementDailyLimit: vi.fn().mockResolvedValue(undefined),
    getCurrentUsage: vi.fn().mockResolvedValue(0),
  } as unknown as IRateLimitRepository;
}

describe('RateLimitService.checkAndIncrementDailyLimit()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('data=false이면 RateLimitError를 던진다', async () => {
    const service = new RateLimitService(makeRateLimitRepo(false));
    await expect(service.checkAndIncrementDailyLimit('user-1')).rejects.toThrow(RateLimitError);
  });

  it('data=true이면 통과한다', async () => {
    const service = new RateLimitService(makeRateLimitRepo(true));
    await expect(service.checkAndIncrementDailyLimit('user-1')).resolves.toBeUndefined();
  });
});

describe('GenerationService.generate()', () => {
  let service: GenerationService;
  let projectRepo: ReturnType<typeof makeProjectRepo>;
  let catalogRepo: ReturnType<typeof makeCatalogRepo>;
  let codeRepo: ReturnType<typeof makeCodeRepo>;

  const mockProject = {
    id: 'proj-1',
    userId: 'user-1',
    context: '실시간 날씨를 보여주는 대시보드를 만들어주세요.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    projectRepo = makeProjectRepo();
    catalogRepo = makeCatalogRepo();
    codeRepo = makeCodeRepo();
    service = new GenerationService(projectRepo, catalogRepo, codeRepo);

    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockProject);
    (projectRepo.getProjectApiIds as ReturnType<typeof vi.fn>).mockResolvedValue(['api-1']);
    (projectRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockProject);
    (catalogRepo.findByIds as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'api-1',
        name: '날씨 API',
        baseUrl: 'https://api.weather.com',
        authType: 'none',
        endpoints: [],
      },
    ]);
    (codeRepo.getNextVersion as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (codeRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'code-1', version: 1, projectId: 'proj-1' });
  });

  it('존재하지 않는 프로젝트면 NotFoundError를 던진다', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.generate('missing', 'user-1')).rejects.toThrow(NotFoundError);
  });

  it('타인의 프로젝트면 ForbiddenError를 던진다', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockProject, userId: 'user-2' });
    await expect(service.generate('proj-1', 'user-1')).rejects.toThrow(ForbiddenError);
  });

  it('정상 생성 시 onProgress 콜백이 호출된다', async () => {
    const onProgress = vi.fn();
    await service.generate('proj-1', 'user-1', onProgress);
    expect(onProgress).toHaveBeenCalledWith(10, expect.any(String));
    expect(onProgress).toHaveBeenCalledWith(30, expect.any(String));
    expect(onProgress).toHaveBeenCalledWith(70, expect.any(String));
    expect(onProgress).toHaveBeenCalledWith(90, expect.any(String));
  });

  it('정상 생성 시 code가 DB에 저장된다', async () => {
    await service.generate('proj-1', 'user-1');
    expect(codeRepo.create).toHaveBeenCalledOnce();
  });

  it('정상 생성 시 CODE_GENERATED 이벤트가 발행된다', async () => {
    const { eventBus } = await import('@/lib/events/eventBus');
    await service.generate('proj-1', 'user-1');
    expect(eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'CODE_GENERATED' }));
  });
});
