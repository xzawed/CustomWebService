import type { IBaseRepository } from './IBaseRepository';
import type { Project } from '@/types/project';

export interface IProjectRepository extends IBaseRepository<Project> {
  findByUserId(userId: string): Promise<Project[]>;
  countTodayGenerations(userId: string): Promise<number>;
  insertProjectApis(projectId: string, apiIds: string[]): Promise<void>;
  getProjectApiIds(projectId: string): Promise<string[]>;
  findBySlug(slug: string): Promise<Project | null>;
  updateSlug(id: string, slug: string, publishedAt: Date): Promise<Project>;
  /** AI가 제안한 slug 후보를 projects.suggested_slugs에 저장한다. */
  updateSuggestedSlugs(id: string, slugs: string[]): Promise<void>;
}
