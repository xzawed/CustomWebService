import { createServiceClient } from '@/lib/supabase/server';
import { getLimits } from '@/lib/config/features';
import { getDbProvider } from '@/lib/config/providers';
import { getDb } from '@/lib/db/connection';
import { getFailoverStatus } from '@/lib/db/failover';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const checks: Record<string, string> = {};
  const usage: Record<string, unknown> = {};
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Database check
  if (getDbProvider() === 'postgres') {
    try {
      const db = getDb();
      const { count } = await import('drizzle-orm');
      const { apiCatalog } = await import('@/lib/db/schema');
      await db.select({ n: count() }).from(apiCatalog).limit(1);
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
      status = 'unhealthy';
    }
  } else {
    let supabase: Awaited<ReturnType<typeof createServiceClient>> | null = null;
    try {
      supabase = await createServiceClient();
      const { error } = await supabase
        .from('api_catalog')
        .select('id', { count: 'exact', head: true });
      checks.database = error ? 'error' : 'ok';
      if (error) status = 'unhealthy';
    } catch {
      checks.database = 'error';
      status = 'unhealthy';
    }

    // Usage limits (Supabase path)
    try {
      if (!supabase) throw new Error('DB not available');
      const limits = getLimits();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [genResult, projectResult, userResult] = await Promise.all([
        supabase
          .from('generated_codes')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', today.toISOString()),
        supabase.from('projects').select('id', { count: 'exact', head: true }),
        supabase.from('users').select('id', { count: 'exact', head: true }),
      ]);

      usage.todayGenerations = genResult.count ?? 0;
      usage.totalProjects = projectResult.count ?? 0;
      usage.totalUsers = userResult.count ?? 0;
      usage.limits = {
        maxDailyGenerationsPerUser: limits.maxDailyGenerations,
        maxApisPerProject: limits.maxApisPerProject,
        maxProjectsPerUser: limits.maxProjectsPerUser,
      };
    } catch {
      usage.error = 'stats unavailable';
    }
  }

  // Postgres path usage stats
  if (getDbProvider() === 'postgres' && checks.database === 'ok') {
    try {
      const db = getDb();
      const { count, gte } = await import('drizzle-orm');
      const { generatedCodes, projects, users } = await import('@/lib/db/schema');
      const limits = getLimits();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [genResult, projectResult, userResult] = await Promise.all([
        db.select({ n: count() }).from(generatedCodes).where(gte(generatedCodes.created_at, today)),
        db.select({ n: count() }).from(projects),
        db.select({ n: count() }).from(users),
      ]);

      usage.todayGenerations = Number(genResult[0]?.n ?? 0);
      usage.totalProjects = Number(projectResult[0]?.n ?? 0);
      usage.totalUsers = Number(userResult[0]?.n ?? 0);
      usage.limits = {
        maxDailyGenerationsPerUser: limits.maxDailyGenerations,
        maxApisPerProject: limits.maxApisPerProject,
        maxProjectsPerUser: limits.maxProjectsPerUser,
      };
    } catch {
      usage.error = 'stats unavailable';
    }
  }

  // AI service check (actual API validation)
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

  // Deploy service check (verify env keys are configured)
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
