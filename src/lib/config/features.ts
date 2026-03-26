export interface FeatureLimits {
  maxApisPerProject: number;
  maxDailyGenerations: number;
  maxProjectsPerUser: number;
  maxRegenerationsPerProject: number;
  contextMinLength: number;
  contextMaxLength: number;
  generationTimeoutMs: number;
}

function env(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const num = Number(val);
  return isNaN(num) ? defaultValue : num;
}

const DEFAULT_LIMITS: FeatureLimits = {
  maxApisPerProject: env('MAX_APIS_PER_PROJECT', 5),
  maxDailyGenerations: env('MAX_DAILY_GENERATIONS', 10),
  maxProjectsPerUser: env('MAX_PROJECTS_PER_USER', 20),
  maxRegenerationsPerProject: env('MAX_REGENERATIONS', 5),
  contextMinLength: env('CONTEXT_MIN_LENGTH', 50),
  contextMaxLength: env('CONTEXT_MAX_LENGTH', 2000),
  generationTimeoutMs: env('GENERATION_TIMEOUT_MS', 120000),
};

const PLAN_OVERRIDES: Record<string, Partial<FeatureLimits>> = {
  free: {},
  pro: {
    maxApisPerProject: 10,
    maxDailyGenerations: 50,
    maxProjectsPerUser: 100,
    contextMaxLength: 5000,
  },
};

export function getLimits(plan: string = 'free'): FeatureLimits {
  return { ...DEFAULT_LIMITS, ...(PLAN_OVERRIDES[plan] ?? {}) };
}

export const LIMITS = getLimits();
