import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectService } from './projectService';
import { ValidationError, ForbiddenError, NotFoundError } from '@/lib/utils/errors';

// Mock repositories
vi.mock('@/repositories/projectRepository', () => ({
  ProjectRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn(),
    findByUserId: vi.fn(),
    findById: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    insertProjectApis: vi.fn(),
    getProjectApiIds: vi.fn(),
    countTodayGenerations: vi.fn(),
  })),
}));

vi.mock('@/repositories/catalogRepository', () => ({
  CatalogRepository: vi.fn().mockImplementation(() => ({
    findByIds: vi.fn(),
    search: vi.fn(),
    getCategories: vi.fn(),
  })),
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

const makeSupabase = () => ({}) as never;

const validContext = 'a'.repeat(50);
const validInput = {
  name: '테스트 프로젝트',
  context: validContext,
  apiIds: ['api-1'],
};

describe('ProjectService.create()', () => {
  let service: ProjectService;
  let projectRepo: Record<string, ReturnType<typeof vi.fn>>;
  let catalogRepo: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new ProjectService(makeSupabase());
    const { ProjectRepository } = await import('@/repositories/projectRepository');
    const { CatalogRepository } = await import('@/repositories/catalogRepository');
    projectRepo = (ProjectRepository as ReturnType<typeof vi.fn>).mock.results[0].value;
    catalogRepo = (CatalogRepository as ReturnType<typeof vi.fn>).mock.results[0].value;

    // 기본 mock 설정
    catalogRepo.findByIds.mockResolvedValue([{ id: 'api-1', name: 'Test API' }]);
    projectRepo.findByUserId.mockResolvedValue([]);
    projectRepo.create.mockResolvedValue({
      id: 'proj-1',
      userId: 'user-1',
      name: '테스트',
      context: validContext,
    });
    projectRepo.insertProjectApis.mockResolvedValue(undefined);
  });

  it('API 선택이 0개면 ValidationError를 던진다', async () => {
    await expect(service.create('user-1', { ...validInput, apiIds: [] })).rejects.toThrow(
      ValidationError
    );
  });

  it('API 선택이 6개 이상이면 ValidationError를 던진다', async () => {
    const apiIds = ['1', '2', '3', '4', '5', '6'];
    catalogRepo.findByIds.mockResolvedValue(apiIds.map((id) => ({ id })));
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
    catalogRepo.findByIds.mockResolvedValue([]); // 아무것도 못 찾음
    await expect(
      service.create('user-1', { ...validInput, apiIds: ['nonexistent'] })
    ).rejects.toThrow(ValidationError);
  });

  it('프로젝트가 20개 이상이면 ValidationError를 던진다', async () => {
    projectRepo.findByUserId.mockResolvedValue(Array(20).fill({ id: 'p' }));
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
  let projectRepo: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new ProjectService(makeSupabase());
    const { ProjectRepository } = await import('@/repositories/projectRepository');
    projectRepo = (ProjectRepository as ReturnType<typeof vi.fn>).mock.results[0].value;
  });

  it('존재하지 않는 프로젝트면 NotFoundError를 던진다', async () => {
    projectRepo.findById.mockResolvedValue(null);
    await expect(service.getById('missing', 'user-1')).rejects.toThrow(NotFoundError);
  });

  it('다른 사용자의 프로젝트면 ForbiddenError를 던진다', async () => {
    projectRepo.findById.mockResolvedValue({ id: 'proj-1', userId: 'user-2' });
    await expect(service.getById('proj-1', 'user-1')).rejects.toThrow(ForbiddenError);
  });

  it('소유자는 정상 조회된다', async () => {
    projectRepo.findById.mockResolvedValue({ id: 'proj-1', userId: 'user-1' });
    const result = await service.getById('proj-1', 'user-1');
    expect(result.id).toBe('proj-1');
  });
});

describe('ProjectService.delete()', () => {
  let service: ProjectService;
  let projectRepo: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new ProjectService(makeSupabase());
    const { ProjectRepository } = await import('@/repositories/projectRepository');
    projectRepo = (ProjectRepository as ReturnType<typeof vi.fn>).mock.results[0].value;
  });

  it('소유자가 아니면 ForbiddenError를 던진다', async () => {
    projectRepo.findById.mockResolvedValue({ id: 'proj-1', userId: 'user-2' });
    await expect(service.delete('proj-1', 'user-1')).rejects.toThrow(ForbiddenError);
  });

  it('소유자면 정상 삭제된다', async () => {
    projectRepo.findById.mockResolvedValue({ id: 'proj-1', userId: 'user-1' });
    projectRepo.delete.mockResolvedValue(undefined);
    await service.delete('proj-1', 'user-1');
    expect(projectRepo.delete).toHaveBeenCalledWith('proj-1');
  });
});
