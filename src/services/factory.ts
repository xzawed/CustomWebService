import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createProjectRepository,
  createCatalogRepository,
  createCodeRepository,
  createRateLimitRepository,
  createUserRepository,
} from '@/repositories/factory';
import { ProjectService } from '@/services/projectService';
import { CatalogService } from '@/services/catalogService';
import { GenerationService } from '@/services/generationService';
import { DeployService } from '@/services/deployService';
import { RateLimitService } from '@/services/rateLimitService';
import { AuthService } from '@/services/authService';

// Each factory accepts optional SupabaseClient (required when DB_PROVIDER=supabase)

export function createProjectService(supabase?: SupabaseClient): ProjectService {
  return new ProjectService(
    createProjectRepository(supabase),
    createCatalogRepository(supabase),
  );
}

export function createCatalogService(supabase?: SupabaseClient): CatalogService {
  return new CatalogService(createCatalogRepository(supabase));
}

export function createGenerationService(supabase?: SupabaseClient): GenerationService {
  return new GenerationService(
    createProjectRepository(supabase),
    createCatalogRepository(supabase),
    createCodeRepository(supabase),
  );
}

export function createDeployService(supabase?: SupabaseClient): DeployService {
  return new DeployService(createProjectRepository(supabase), createCodeRepository(supabase));
}

export function createRateLimitService(supabase?: SupabaseClient): RateLimitService {
  return new RateLimitService(createRateLimitRepository(supabase));
}

export function createAuthService(supabase: SupabaseClient): AuthService {
  return new AuthService(supabase, createUserRepository(supabase));
}
