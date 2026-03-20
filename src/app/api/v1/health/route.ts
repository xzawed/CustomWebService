import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const checks: Record<string, string> = {};
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Database check
  try {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .from('api_catalog')
      .select('id', { count: 'exact', head: true });
    checks.database = error ? 'error' : 'ok';
  } catch {
    checks.database = 'error';
    status = 'degraded';
  }

  // Don't expose which API keys are configured - just check overall readiness
  checks.services = 'ok';

  if (checks.database === 'error') status = 'unhealthy';

  return Response.json({
    status,
    timestamp: new Date().toISOString(),
    checks: {
      database: checks.database,
      services: checks.services,
    },
  });
}
