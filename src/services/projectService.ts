import type { IProjectRepository, ICatalogRepository } from '@/repositories/interfaces';
import { eventBus } from '@/lib/events/eventBus';
import { getLimits } from '@/lib/config/features';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { assertOwner } from '@/lib/auth/authorize';
import { generateSlug, isValidSlug } from '@/lib/utils/slugify';
import { isUniqueViolation } from '@/lib/db/errors';
import type { Project, ProjectMetadata, CreateProjectInput } from '@/types/project';
import type { ApiCatalogItem } from '@/types/api';
import { t } from '@/lib/i18n';

export class ProjectService {
  constructor(
    private projectRepo: IProjectRepository,
    private catalogRepo: ICatalogRepository
  ) {}

  async create(userId: string, input: CreateProjectInput): Promise<Project> {
    const limits = getLimits();

    if (input.apiIds.length === 0) {
      throw new ValidationError(t('project.validation.minApis'));
    }
    if (input.apiIds.length > limits.maxApisPerProject) {
      throw new ValidationError(t('project.validation.maxApis', { max: limits.maxApisPerProject }));
    }

    if (input.context.length < limits.contextMinLength) {
      throw new ValidationError(t('project.validation.contextMin', { min: limits.contextMinLength }));
    }
    if (input.context.length > limits.contextMaxLength) {
      throw new ValidationError(t('project.validation.contextMax', { max: limits.contextMaxLength }));
    }

    const apis = await this.catalogRepo.findByIds(input.apiIds);
    if (apis.length !== input.apiIds.length) {
      throw new ValidationError(t('project.validation.invalidApis'));
    }

    const userProjects = await this.projectRepo.findByUserId(userId);
    if (userProjects.length >= limits.maxProjectsPerUser) {
      throw new ValidationError(t('project.validation.maxProjects', { max: limits.maxProjectsPerUser }));
    }

    const createData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
      userId,
      organizationId: input.organizationId ?? null,
      name: input.name,
      context: input.context,
      status: 'draft',
      deployUrl: null,
      deployPlatform: null,
      repoUrl: null,
      previewUrl: null,
      metadata: {
        ...(input.designPreferences ? { designPreferences: input.designPreferences } : {}),
      } as ProjectMetadata,
      currentVersion: 0,
      apis: [] as ApiCatalogItem[], // stripped by ProjectRepository.toDatabase()
      slug: null,
      publishedAt: null,
    };
    const project = await this.projectRepo.create(createData);

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
    if (!project) throw new NotFoundError(t('project.notFound'), id);
    assertOwner(project, userId);
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

  async publish(id: string, userId: string, chosenSlug?: string): Promise<Project> {
    const project = await this.getById(id, userId);
    const publishable: Project['status'][] = ['generated', 'deployed', 'unpublished'];
    if (!publishable.includes(project.status)) {
      throw new ValidationError(t('project.validation.notGenerated'));
    }

    // 재게시: 기존 slug 유지 (현행 정책)
    if (project.slug) {
      const republished = await this.projectRepo.updateSlug(id, project.slug, new Date());
      this.emitPublishedEvent(id, userId, project.slug);
      return republished;
    }

    // 최초 게시: chosenSlug 우선, 아니면 generateSlug 폴백
    const baseSlug = chosenSlug && isValidSlug(chosenSlug)
      ? chosenSlug
      : generateSlug(project.name, project.id);

    const finalSlug = await this.assignUniqueSlug(baseSlug);

    // 레이스 대비: 23505 unique 위반 시 1회 재시도
    try {
      const published = await this.projectRepo.updateSlug(id, finalSlug, new Date());
      this.emitPublishedEvent(id, userId, finalSlug);
      return published;
    } catch (err) {
      if (isUniqueViolation(err)) {
        const retrySlug = await this.assignUniqueSlug(baseSlug);
        const published = await this.projectRepo.updateSlug(id, retrySlug, new Date());
        this.emitPublishedEvent(id, userId, retrySlug);
        return published;
      }
      throw err;
    }
  }

  private emitPublishedEvent(id: string, userId: string, slug: string): void {
    eventBus.emit({
      type: 'PROJECT_PUBLISHED',
      payload: { projectId: id, userId, slug },
    });
  }

  private async assignUniqueSlug(base: string): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const existing = await this.projectRepo.findBySlug(candidate);
      if (!existing) return candidate;
    }
    // 극단적 폴백
    return `${base}-${Date.now().toString(36).slice(-4)}`;
  }

  async unpublish(id: string, userId: string): Promise<Project> {
    const project = await this.getById(id, userId);

    if (project.status !== 'published') {
      throw new ValidationError(t('project.validation.notPublished'));
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
