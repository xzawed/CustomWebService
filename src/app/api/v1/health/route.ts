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

  // AI service check (verify env key is configured for the active provider)
  const aiProvider = (process.env.AI_PROVIDER as string) ?? 'claude';
  const hasAiKey =
    aiProvider === 'claude'
      ? !!process.env.ANTHROPIC_API_KEY
      : !!process.env.XAI_API_KEY;
  checks.ai = hasAiKey ? 'ok' : 'unconfigured';
  checks.aiProvider = aiProvider;
  if (checks.ai !== 'ok') status = status === 'healthy' ? 'degraded' : status;

  // Deploy service check (verify env keys are configured)
  const hasGithub = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_ORG);
  const hasRailway = !!process.env.RAILWAY_TOKEN;
  checks.deploy = hasGithub || hasRailway ? 'ok' : 'unconfigured';
  if (checks.deploy !== 'ok') status = status === 'healthy' ? 'degraded' : status;

  // Usage limits (system-wide counts for monitoring) — 병렬 실행으로 응답 단축
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

  return Response.json({
    status,
    timestamp: new Date().toISOString(),
    checks,
    usage,
  });
}
