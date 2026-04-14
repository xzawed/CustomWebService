import { createServiceClient } from '@/lib/supabase/server';
import { getLimits } from '@/lib/config/features';
import { getDbProvider } from '@/lib/config/providers';
import { getFailoverStatus } from '@/lib/db/failover';
import { createCatalogRepository } from '@/repositories/factory';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const checks: Record<string, string> = {};
  const usage: Record<string, unknown> = {};
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Database check + usage stats
  try {
    const supabase = getDbProvider() === 'supabase' ? await createServiceClient() : undefined;
    const repo = createCatalogRepository(supabase);

    const dbOk = await repo.ping();
    checks.database = dbOk ? 'ok' : 'error';
    if (!dbOk) status = 'unhealthy';

    if (dbOk) {
      try {
        const limits = getLimits();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const counts = await repo.getUsageCounts(today);
        usage.todayGenerations = counts.todayGenerations;
        usage.totalProjects = counts.totalProjects;
        usage.totalUsers = counts.totalUsers;
        usage.limits = {
          maxDailyGenerationsPerUser: limits.maxDailyGenerations,
          maxApisPerProject: limits.maxApisPerProject,
          maxProjectsPerUser: limits.maxProjectsPerUser,
        };
      } catch {
        usage.error = 'stats unavailable';
      }
    }
  } catch {
    checks.database = 'error';
    status = 'unhealthy';
  }

  // AI service check
  checks.aiProvider = 'claude';
  try {
    const { AiProviderFactory } = await import('@/providers/ai/AiProviderFactory');
    const provider = AiProviderFactory.createForTask('suggestion');
    const { available } = await provider.checkAvailability();
    checks.ai = available ? 'ok' : 'unavailable';
  } catch {
    checks.ai = 'unconfigured';
  }
  if (checks.ai !== 'ok') status = status === 'healthy' ? 'degraded' : status;

  // Deploy service check
  const hasGithub = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_ORG);
  const hasRailway = !!process.env.RAILWAY_TOKEN;
  checks.deploy = hasGithub || hasRailway ? 'ok' : 'unconfigured';
  if (checks.deploy !== 'ok') status = status === 'healthy' ? 'degraded' : status;

  return Response.json({
    status,
    timestamp: new Date().toISOString(),
    checks,
    usage,
    failover: getFailoverStatus(),
  });
}
