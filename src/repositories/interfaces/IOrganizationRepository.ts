import type { IBaseRepository } from './IBaseRepository';
import type { Organization } from '@/types/organization';

export interface IOrganizationRepository extends IBaseRepository<Organization> {
  findBySlug(slug: string): Promise<Organization | null>;
  findByUserId(userId: string): Promise<Organization[]>;
}
