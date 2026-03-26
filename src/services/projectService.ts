import type { SupabaseClient } from '@supabase/supabase-js';
import { ProjectRepository } from '@/repositories/projectRepository';
import { CatalogRepository } from '@/repositories/catalogRepository';
import { eventBus } from '@/lib/events/eventBus';
import { getLimits } from '@/lib/config/features';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/utils/errors';
import { generateSlug } from '@/lib/utils/slugify';
import type { Project, CreateProjectInput } from '@/types/project';

export class ProjectService {
  private projectRepo: ProjectRepository;
  private catalogRepo: CatalogRepository;

  constructor(supabase: SupabaseClient) {
    this.projectRepo = new ProjectRepository(supabase);
    this.catalogRepo = new CatalogRepository(supabase);
  }

  async create(userId: string, input: CreateProjectInput): Promise<Project> {
    const limits = getLimits();

    if (input.apiIds.length === 0) {
      throw new ValidationError('최소 1개의 API를 선택해주세요.');
    }
    if (input.apiIds.length > limits.maxApisPerProject) {
      throw new ValidationError(`API는 최대 ${limits.maxApisPerProject}개까지 선택 가능합니다.`);
    }

    if (input.context.length < limits.contextMinLength) {
      throw new ValidationError(
        `서비스 설명은 최소 ${limits.contextMinLength}자 이상 입력해주세요.`
      );
    }
    if (input.context.length > limits.contextMaxLength) {
      throw new ValidationError(
        `서비스 설명은 최대 ${limits.contextMaxLength}자까지 입력 가능합니다.`
      );
    }

    const apis = await this.catalogRepo.findByIds(input.apiIds);
    if (apis.length !== input.apiIds.length) {
      throw new ValidationError('존재하지 않는 API가 포함되어 있습니다.');
    }

    const userProjects = await this.projectRepo.findByUserId(userId);
    if (userProjects.length >= limits.maxProjectsPerUser) {
      throw new ValidationError(
        `프로젝트는 최대 ${limits.maxProjectsPerUser}개까지 생성 가능합니다.`
      );
    }

    const project = await this.projectRepo.create({
      userId,
      organizationId: input.organizationId ?? null,
      name: input.name,
      context: input.context,
      status: 'draft',
      deployUrl: null,
      deployPlatform: null,
      repoUrl: null,
      previewUrl: null,
      metadata: {},
      currentVersion: 0,
      slug: null,
      publishedAt: null,
    } as Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'apis'>);

    // Use repository method instead of direct Supabase access
    await this.projectRepo.insertProjectApis(project.id, input.apiIds);

    eventBus.emit({
      type: 'PROJECT_CREATED',
      payload: { projectId: project.id, userId, apiCount: input.apiIds.length },
    });

    return { ...project, apis };
  }

  async getByUserId(userId: string): Promise<Project[]> {
    return this.projectRepo.findByUserId(userId);
  }

  async getById(id: string, userId: string): Promise<Project> {
    const project = await this.projectRepo.findById(id);
    if (!project) throw new NotFoundError('프로젝트', id);
    if (project.userId !== userId) throw new ForbiddenError();
    return project;
  }

  async getProjectApiIds(projectId: string): Promise<string[]> {
    return this.projectRepo.getProjectApiIds(projectId);
  }

  async delete(id: string, userId: string): Promise<void> {
    const project = await this.getById(id, userId);
    await this.projectRepo.delete(project.id);
    eventBus.emit({ type: 'PROJECT_DELETED', payload: { projectId: id } });
  }

  async updateStatus(id: string, status: Project['status']): Promise<Project> {
    return this.projectRepo.update(id, { status } as Partial<Project>);
  }

  async publish(id: string, userId: string): Promise<Project> {
    const project = await this.getById(id, userId);

    const publishableStatuses: Project['status'][] = ['generated', 'deployed', 'unpublished'];
    if (!publishableStatuses.includes(project.status)) {
      throw new ValidationError('생성이 완료된 프로젝트만 게시할 수 있습니다.');
    }

    const slug = project.slug ?? generateSlug(project.name, project.id);
    const published = await this.projectRepo.updateSlug(id, slug, new Date());

    eventBus.emit({
      type: 'PROJECT_PUBLISHED',
      payload: { projectId: id, userId, slug },
    });

    return published;
  }

  async unpublish(id: string, userId: string): Promise<Project> {
    const project = await this.getById(id, userId);

    if (project.status !== 'published') {
      throw new ValidationError('게시된 프로젝트만 게시 취소할 수 있습니다.');
    }

    const updated = await this.projectRepo.update(id, {
      status: 'unpublished',
    } as Partial<Project>);

    eventBus.emit({
      type: 'PROJECT_UNPUBLISHED',
      payload: { projectId: id, userId },
    });

    return updated;
  }
}
