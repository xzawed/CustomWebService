import { getLimits } from '@/lib/config/features';
import { checkAdminAuth } from '@/lib/utils/adminAuth';
import { createCatalogRepository } from '@/repositories/factory';

export const dynamic = 'force-dynamic';

function publicStatus(): Response {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const wantsDetailed = url.searchParams.get('detailed') === 'true';

  // Public endpoint — returns minimal status only (no infrastructure details).
  // 관리자 검사는 상세 응답을 요구한 요청에서만 수행한다. 그래야 Railway 헬스체크·
  // 업타임 모니터 같은 공개 트래픽이 관리자 레이트리밋 버킷을 소모하지 않는다.
  if (!wantsDetailed) return publicStatus();

  // checkAdminAuth는 timing-safe 비교 + per-IP 레이트리밋을 적용한다.
  const auth = checkAdminAuth(request);

  // 한도 초과는 **반드시 명시적으로 알린다.** 공개 응답(status:'ok')으로 폴백하면 올바른 키를
  // 가진 관리자가 조용히 정상 상태를 통보받아 실제 unhealthy가 은폐된다. 인시던트 대응 런북이
  // 이 엔드포인트를 반복 호출하는 경로라 실제 위험이다(docs/security/incident-response.md).
  if (auth === 'rate_limited') {
    return Response.json(
      { status: 'rate_limited', timestamp: new Date().toISOString() },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // 인증 실패는 403이 아니라 공개 응답으로 폴백한다(상세 엔드포인트 존재 여부를 노출하지 않음).
  if (auth === 'unauthorized') return publicStatus();

  const checks: Record<string, string> = {};
  const usage: Record<string, unknown> = {};
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Database check + usage stats
  try {
    const repo = createCatalogRepository();

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
  });
}
