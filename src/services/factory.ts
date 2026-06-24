import {
  createProjectRepository,
  createCatalogRepository,
  createCodeRepository,
  createRateLimitRepository,
  createUserRepository,
  createAuthTokenRepository,
} from '@/repositories/factory';
import { ProjectService } from '@/services/projectService';
import { CatalogService } from '@/services/catalogService';
import { DeployService } from '@/services/deployService';
import { RateLimitService } from '@/services/rateLimitService';
import { AuthService } from '@/services/authService';
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/email/emailService';

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

export function createAuthService(): AuthService {
  return new AuthService(createUserRepository(), createAuthTokenRepository(), {
    sendVerificationEmail,
    sendPasswordResetEmail,
  });
}
