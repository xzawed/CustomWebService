import { createServiceClient } from '@/lib/supabase/server';
import { getLimits } from '@/lib/config/features';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const checks: Record<string, string> = {};
  const usage: Record<string, unknown> = {};
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Database check
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

  // AI service check (verify env key is configured)
  checks.ai = process.env.XAI_API_KEY ? 'ok' : 'unconfigured';
  if (checks.ai !== 'ok') status = status === 'healthy' ? 'degraded' : status;

  // Deploy service check (verify env keys are configured)
  const hasGithub = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_ORG);
  const hasRailway = !!process.env.RAILWAY_TOKEN;
  checks.deploy = hasGithub || hasRailway ? 'ok' : 'unconfigured';
  if (checks.deploy !== 'ok') status = status === 'healthy' ? 'degraded' : status;

  // Usage limits (system-wide counts for monitoring)
  try {
    if (!supabase) throw new Error('DB not available');
    const limits = getLimits();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: todayGenerations } = await supabase
      .from('generated_codes')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', today.toISOString());

    const { count: totalProjects } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true });

    const { count: totalUsers } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true });

    usage.todayGenerations = todayGenerations ?? 0;
    usage.totalProjects = totalProjects ?? 0;
    usage.totalUsers = totalUsers ?? 0;
    usage.limits = {
      maxDailyGenerationsPerUser: limits.maxDailyGenerations,
      maxApisPerProject: limits.maxApisPerProject,
      maxProjectsPerUser: limits.maxProjectsPerUser,
    };
  } catch {
    // Usage stats are non-critical
    usage.error = 'stats unavailable';
  }

  return Response.json({
    status,
    timestamp: new Date().toISOString(),
    checks,
    usage,
  });
}
