import {
  createProjectRepository,
  createCatalogRepository,
  createCodeRepository,
  createRateLimitRepository,
} from '@/repositories/factory';
import { ProjectService } from '@/services/projectService';
import { CatalogService } from '@/services/catalogService';
import { DeployService } from '@/services/deployService';
import { RateLimitService } from '@/services/rateLimitService';

export function createProjectService(): ProjectService {
  return new ProjectService(createProjectRepository(), createCatalogRepository());
}

export function createCatalogService(): CatalogService {
  return new CatalogService(createCatalogRepository());
}

export function createDeployService(): DeployService {
  return new DeployService(createProjectRepository(), createCodeRepository());
}

export function createRateLimitService(): RateLimitService {
  return new RateLimitService(createRateLimitRepository());
}
