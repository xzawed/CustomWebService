import { getSiteProxyStats } from '@/lib/proxy/siteRateLimit';
import { adminCorsHeaders, verifyAdminKey, withAdminCors } from '@/lib/utils/adminAuth';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';

const DEFAULT_LIMIT = 50;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: adminCorsHeaders });
}

/**
 * 게시 사이트 프록시 사용량 진단.
 *
 * site 모드는 익명 방문자가 프로젝트 오너의 키로 업스트림을 호출하므로 레이트리밋이 유일한
 * 방어선이다. 그런데 한도 초과가 429 응답으로만 나타나 **어떤 프로젝트가 얼마나 소진되고
 * 있는지 아무도 알 수 없었다.** 기본값 20/120도 실사용 데이터 없이 보수적으로 정한 값이라
 * 조정 근거가 필요하다.
 *
 * 집계는 `siteRateLimit`의 인메모리 카운터라 **재시작 시 초기화**된다(리밋 자체와 동일한
 * 단일 인스턴스 전제). 응답의 `since`·`note`가 이 성질을 드러낸다.
 */
export async function GET(request: Request): Promise<Response> {
  const res = await (async () => {
    try {
      verifyAdminKey(request);

      const url = new URL(request.url);
      const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_LIMIT;

      const stats = getSiteProxyStats();
      const projects = stats.projects.slice(0, limit);

      return jsonResponse({
        success: true,
        data: {
          ...stats,
          projects,
          // 상위 N개만 잘라 보내므로 전체 개수와 반환 개수를 함께 준다 —
          // 조용히 자르면 "이게 전부"로 오독된다.
          returnedProjects: projects.length,
          note: '인메모리 집계 — 프로세스 재시작 시 초기화된다(단일 인스턴스 전제).',
        },
      });
    } catch (error) {
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}
