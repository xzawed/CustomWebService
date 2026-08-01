import {
  createProjectRepository,
  createCatalogRepository,
  createRateLimitRepository,
  createUserRepository,
  createAuthTokenRepository,
} from '@/repositories/factory';
import { ProjectService } from '@/services/projectService';
import { CatalogService } from '@/services/catalogService';
import { RateLimitService } from '@/services/rateLimitService';
import { AuthService } from '@/services/authService';
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/email/emailService';

export function createProjectService(): ProjectService {
  return new ProjectService(createProjectRepository(), createCatalogRepository());
}

export function createCatalogService(): CatalogService {
  return new CatalogService(createCatalogRepository());
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
