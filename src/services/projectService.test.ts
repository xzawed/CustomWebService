import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectService } from './projectService';
import { ValidationError, ForbiddenError, NotFoundError } from '@/lib/utils/errors';
import type { IProjectRepository, ICatalogRepository } from '@/repositories/interfaces';

vi.mock('@/lib/utils/slugify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/slugify')>();
  return {
    ...actual,
    generateSlug: vi.fn().mockReturnValue('generated-slug'),
    isValidSlug: actual.isValidSlug,
  };
});

vi.mock('@/lib/db/errors', () => ({
  isUniqueViolation: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

function makeProjectRepo(): IProjectRepository {
  return {
    create: vi.fn(),
    findByUserId: vi.fn(),
    findById: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    insertProjectApis: vi.fn(),
    getProjectApiIds: vi.fn(),
    countTodayGenerations: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
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

const validContext = 'a'.repeat(50);
const validInput = {
  name: '테스트 프로젝트',
  context: validContext,
  apiIds: ['api-1'],
};

describe('ProjectService.create()', () => {
  let service: ProjectService;
  let projectRepo: IProjectRepository;
  let catalogRepo: ICatalogRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    projectRepo = makeProjectRepo();
    catalogRepo = makeCatalogRepo();
    service = new ProjectService(projectRepo, catalogRepo);

    // 기본 mock 설정
    (catalogRepo.findByIds as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'api-1', name: 'Test API' }]);
    (projectRepo.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (projectRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'proj-1',
      userId: 'user-1',
      name: '테스트',
      context: validContext,
    });
    (projectRepo.insertProjectApis as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('API 선택이 0개면 ValidationError를 던진다', async () => {
    await expect(service.create('user-1', { ...validInput, apiIds: [] })).rejects.toThrow(
      ValidationError
    );
  });

  it('API 선택이 6개 이상이면 ValidationError를 던진다', async () => {
    const apiIds = ['1', '2', '3', '4', '5', '6'];
    (catalogRepo.findByIds as ReturnType<typeof vi.fn>).mockResolvedValue(apiIds.map((id) => ({ id })));
    await expect(service.create('user-1', { ...validInput, apiIds })).rejects.toThrow(
      ValidationError
    );
  });

  it('서비스 설명이 50자 미만이면 ValidationError를 던진다', async () => {
    await expect(
      service.create('user-1', { ...validInput, context: 'a'.repeat(49) })
    ).rejects.toThrow(ValidationError);
  });

  it('서비스 설명이 2000자 초과이면 ValidationError를 던진다', async () => {
    await expect(
      service.create('user-1', { ...validInput, context: 'a'.repeat(2001) })
    ).rejects.toThrow(ValidationError);
  });

  it('존재하지 않는 API ID가 포함되면 ValidationError를 던진다', async () => {
    (catalogRepo.findByIds as ReturnType<typeof vi.fn>).mockResolvedValue([]); // 아무것도 못 찾음
    await expect(
      service.create('user-1', { ...validInput, apiIds: ['nonexistent'] })
    ).rejects.toThrow(ValidationError);
  });

  it('프로젝트가 20개 이상이면 ValidationError를 던진다', async () => {
    (projectRepo.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue(Array(20).fill({ id: 'p' }));
    await expect(service.create('user-1', validInput)).rejects.toThrow(ValidationError);
  });

  it('정상 입력이면 프로젝트를 생성하고 반환한다', async () => {
    const result = await service.create('user-1', validInput);
    expect(projectRepo.create).toHaveBeenCalledOnce();
    expect(projectRepo.insertProjectApis).toHaveBeenCalledWith('proj-1', ['api-1']);
    expect(result.id).toBe('proj-1');
  });
});

describe('ProjectService.getById()', () => {
  let service: ProjectService;
  let projectRepo: IProjectRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    projectRepo = makeProjectRepo();
    service = new ProjectService(projectRepo, makeCatalogRepo());
  });

  it('존재하지 않는 프로젝트면 NotFoundError를 던진다', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.getById('missing', 'user-1')).rejects.toThrow(NotFoundError);
  });

  it('다른 사용자의 프로젝트면 ForbiddenError를 던진다', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'proj-1', userId: 'user-2' });
    await expect(service.getById('proj-1', 'user-1')).rejects.toThrow(ForbiddenError);
  });

  it('소유자는 정상 조회된다', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'proj-1', userId: 'user-1' });
    const result = await service.getById('proj-1', 'user-1');
    expect(result.id).toBe('proj-1');
  });
});

describe('ProjectService.delete()', () => {
  let service: ProjectService;
  let projectRepo: IProjectRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    projectRepo = makeProjectRepo();
    service = new ProjectService(projectRepo, makeCatalogRepo());
  });

  it('소유자가 아니면 ForbiddenError를 던진다', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'proj-1', userId: 'user-2' });
    await expect(service.delete('proj-1', 'user-1')).rejects.toThrow(ForbiddenError);
  });

  it('소유자면 정상 삭제된다', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'proj-1', userId: 'user-1' });
    (projectRepo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await service.delete('proj-1', 'user-1');
    expect(projectRepo.delete).toHaveBeenCalledWith('proj-1');
  });
});

describe('ProjectService.publish()', () => {
  let service: ProjectService;
  let projectRepo: IProjectRepository;

  const baseProject = {
    id: 'proj-1',
    userId: 'user-1',
    name: 'My Service',
    status: 'generated' as const,
    slug: null,
    publishedAt: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    projectRepo = makeProjectRepo();
    service = new ProjectService(projectRepo, makeCatalogRepo());

    // isUniqueViolation 기본값: false
    const { isUniqueViolation } = await import('@/lib/db/errors');
    vi.mocked(isUniqueViolation).mockReturnValue(false);

    // generateSlug 기본값
    const { generateSlug } = await import('@/lib/utils/slugify');
    vi.mocked(generateSlug).mockReturnValue('generated-slug');
  });

  it('재게시는 기존 slug를 유지한다', async () => {
    const projectWithSlug = { ...baseProject, status: 'deployed' as const, slug: 'existing-slug' };
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(projectWithSlug);
    (projectRepo.updateSlug as ReturnType<typeof vi.fn>).mockResolvedValue({ ...projectWithSlug, status: 'published' });

    const result = await service.publish('proj-1', 'user-1');

    expect(projectRepo.updateSlug).toHaveBeenCalledWith('proj-1', 'existing-slug', expect.any(Date));
    expect(result.slug).toBe('existing-slug');
  });

  it('최초 게시: chosenSlug가 유효하면 사용된다', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(baseProject);
    (projectRepo.findBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (projectRepo.updateSlug as ReturnType<typeof vi.fn>).mockResolvedValue({ ...baseProject, slug: 'my-service', status: 'published' });

    await service.publish('proj-1', 'user-1', 'my-service');

    expect(projectRepo.updateSlug).toHaveBeenCalledWith('proj-1', 'my-service', expect.any(Date));
  });

  it('최초 게시: chosenSlug 없으면 generateSlug 폴백', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(baseProject);
    (projectRepo.findBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (projectRepo.updateSlug as ReturnType<typeof vi.fn>).mockResolvedValue({ ...baseProject, slug: 'generated-slug', status: 'published' });

    await service.publish('proj-1', 'user-1');

    expect(projectRepo.updateSlug).toHaveBeenCalledWith('proj-1', 'generated-slug', expect.any(Date));
  });

  it('최초 게시: 유효하지 않은 chosenSlug는 generateSlug 폴백', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(baseProject);
    (projectRepo.findBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (projectRepo.updateSlug as ReturnType<typeof vi.fn>).mockResolvedValue({ ...baseProject, slug: 'generated-slug', status: 'published' });

    // 'a'는 SLUG_REGEX(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/)에 맞지 않음
    await service.publish('proj-1', 'user-1', 'a');

    expect(projectRepo.updateSlug).toHaveBeenCalledWith('proj-1', 'generated-slug', expect.any(Date));
  });

  it('assignUniqueSlug: 충돌 시 suffix 부여', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(baseProject);
    // 'my-service'는 이미 사용 중, 'my-service-2'는 사용 가능
    (projectRepo.findBySlug as ReturnType<typeof vi.fn>)
      .mockImplementation((slug: string) => {
        if (slug === 'my-service') return Promise.resolve({ id: 'other-proj' });
        return Promise.resolve(null);
      });
    (projectRepo.updateSlug as ReturnType<typeof vi.fn>).mockResolvedValue({ ...baseProject, slug: 'my-service-2', status: 'published' });

    await service.publish('proj-1', 'user-1', 'my-service');

    expect(projectRepo.updateSlug).toHaveBeenCalledWith('proj-1', 'my-service-2', expect.any(Date));
  });

  it('assignUniqueSlug: 23505 에러 시 1회 재시도', async () => {
    const { isUniqueViolation } = await import('@/lib/db/errors');
    vi.mocked(isUniqueViolation).mockReturnValue(true);

    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(baseProject);
    // 첫 번째 assignUniqueSlug 호출: 'my-service' 사용 가능
    // 두 번째 assignUniqueSlug 호출(재시도): 'my-service' 사용 중, 'my-service-2' 사용 가능
    let findBySlugCallCount = 0;
    (projectRepo.findBySlug as ReturnType<typeof vi.fn>).mockImplementation((slug: string) => {
      findBySlugCallCount++;
      if (findBySlugCallCount <= 1) {
        // 첫 번째 assignUniqueSlug: 'my-service' → null (사용 가능)
        return Promise.resolve(null);
      }
      // 두 번째 assignUniqueSlug(재시도): 'my-service' → 충돌, 'my-service-2' → null
      if (slug === 'my-service') return Promise.resolve({ id: 'other-proj' });
      return Promise.resolve(null);
    });

    const retryProject = { ...baseProject, slug: 'my-service-2', status: 'published' };
    (projectRepo.updateSlug as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('duplicate key 23505'))
      .mockResolvedValueOnce(retryProject);

    const result = await service.publish('proj-1', 'user-1', 'my-service');

    expect(projectRepo.updateSlug).toHaveBeenCalledTimes(2);
    expect(result.slug).toBe('my-service-2');
  });

  it('생성 완료되지 않은 프로젝트는 ValidationError', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseProject,
      status: 'generating',
    });

    await expect(service.publish('proj-1', 'user-1')).rejects.toThrow(ValidationError);
  });
});

describe('ProjectService.unpublish()', () => {
  let service: ProjectService;
  let projectRepo: IProjectRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    projectRepo = makeProjectRepo();
    service = new ProjectService(projectRepo, makeCatalogRepo());
  });

  it('게시되지 않은 프로젝트는 ValidationError를 던진다', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'proj-1',
      userId: 'user-1',
      status: 'draft',
    });

    await expect(service.unpublish('proj-1', 'user-1')).rejects.toThrow(ValidationError);
  });

  it('게시된 프로젝트를 unpublished로 변경한다', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'proj-1',
      userId: 'user-1',
      status: 'published',
    });
    (projectRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'proj-1',
      userId: 'user-1',
      status: 'unpublished',
    });

    const result = await service.unpublish('proj-1', 'user-1');

    expect(projectRepo.update).toHaveBeenCalledWith('proj-1', { status: 'unpublished' });
    expect(result.status).toBe('unpublished');
  });

  it('소유자가 아니면 ForbiddenError를 던진다', async () => {
    (projectRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'proj-1',
      userId: 'user-2',
      status: 'published',
    });

    await expect(service.unpublish('proj-1', 'user-1')).rejects.toThrow(ForbiddenError);
  });
});

describe('ProjectService.getByUserId()', () => {
  let service: ProjectService;
  let projectRepo: IProjectRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    projectRepo = makeProjectRepo();
    service = new ProjectService(projectRepo, makeCatalogRepo());
  });

  it('사용자의 프로젝트 목록을 반환한다', async () => {
    const projects = [
      { id: 'proj-1', userId: 'user-1' },
      { id: 'proj-2', userId: 'user-1' },
    ];
    (projectRepo.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue(projects);

    const result = await service.getByUserId('user-1');

    expect(result).toHaveLength(2);
    expect(projectRepo.findByUserId).toHaveBeenCalledWith('user-1');
  });

  it('프로젝트가 없으면 빈 배열을 반환한다', async () => {
    (projectRepo.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await service.getByUserId('user-no-projects');

    expect(result).toEqual([]);
  });
});

describe('ProjectService.getProjectApiIds()', () => {
  let service: ProjectService;
  let projectRepo: IProjectRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    projectRepo = makeProjectRepo();
    service = new ProjectService(projectRepo, makeCatalogRepo());
  });

  it('프로젝트의 API ID 목록을 반환한다', async () => {
    (projectRepo.getProjectApiIds as ReturnType<typeof vi.fn>).mockResolvedValue(['api-1', 'api-2']);

    const result = await service.getProjectApiIds('proj-1');

    expect(result).toEqual(['api-1', 'api-2']);
    expect(projectRepo.getProjectApiIds).toHaveBeenCalledWith('proj-1');
  });

  it('API가 없으면 빈 배열을 반환한다', async () => {
    (projectRepo.getProjectApiIds as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await service.getProjectApiIds('proj-no-apis');

    expect(result).toEqual([]);
  });
});

describe('ProjectService.updateStatus()', () => {
  let service: ProjectService;
  let projectRepo: IProjectRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    projectRepo = makeProjectRepo();
    service = new ProjectService(projectRepo, makeCatalogRepo());
  });

  it('프로젝트 상태를 업데이트하고 반환한다', async () => {
    const updated = { id: 'proj-1', userId: 'user-1', status: 'generated' as const };
    (projectRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const result = await service.updateStatus('proj-1', 'generated');

    expect(projectRepo.update).toHaveBeenCalledWith('proj-1', { status: 'generated' });
    expect(result.status).toBe('generated');
  });
});
