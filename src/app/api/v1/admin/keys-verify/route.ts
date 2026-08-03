import { createCatalogRepository } from '@/repositories/factory';
import { adminCorsHeaders, verifyAdminKey, withAdminCors } from '@/lib/utils/adminAuth';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';
import { verifyApiKey, type KeyCheckApi, type KeyFetch, type KeyCheckResult } from '@/lib/catalog/keyCheck';

// 배포 런타임에서 실행돼야 sealed env 키가 주입된다 (로컬 railway run은 sealed 미주입).
export const runtime = 'nodejs';

const realFetch: KeyFetch = async (url, headers) => {
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    const ct = res.headers.get('content-type') ?? '';
    const bodyText = /json|text|xml/i.test(ct) ? (await res.text()).slice(0, 4000) : '';
    return { status: res.status, bodyText, networkError: false };
  } catch {
    return { status: 0, bodyText: '', networkError: true };
  }
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: adminCorsHeaders });
}

/**
 * GET /api/v1/admin/keys-verify[?includeInactive=true]
 *
 * "플랫폼 키 의존" API(api_key + auth_config.env_var, default_key 없음)의 키 유효성을
 * 배포 런타임의 env 키로 실제 인증 요청을 보내 검증한다. 키 값은 응답에 노출하지 않는다.
 * 관리자 인증 필요(Authorization: Bearer <ADMIN_API_KEY>).
 *
 * **`includeInactive=true`가 필요한 이유**: 기본값은 활성 API만 본다. 그런데 키를 새로
 * 발급해 등록하려는 대상은 **정의상 비활성**이라, 기본 조회로는 "키가 먹히는지" 확인할
 * 방법이 아예 없었다. 활성화(`POST /admin/catalog/activate`) 전에 이걸로 먼저 확인한다.
 */
export async function GET(request: Request): Promise<Response> {
  const res = await (async () => {
    try {
      verifyAdminKey(request);

      const includeInactive =
        new URL(request.url).searchParams.get('includeInactive') === 'true';

      // 빈 필터 = 전체. 활성만 볼 때만 isActive 조건을 건다.
      const { items } = await createCatalogRepository().findMany(
        includeInactive ? {} : { isActive: true },
        { limit: 200, orderBy: 'name', orderDirection: 'asc' },
      );

      const keyed = items.filter(
        (a) =>
          a.authType === 'api_key' &&
          Boolean(a.authConfig?.env_var) &&
          !a.authConfig?.default_key,
      );

      const results: (KeyCheckResult & { apiId: string; isActive: boolean })[] = [];
      for (const a of keyed) {
        const api: KeyCheckApi = {
          name: a.name,
          baseUrl: a.baseUrl,
          authConfig: a.authConfig as KeyCheckApi['authConfig'],
          endpoints: a.endpoints as unknown as KeyCheckApi['endpoints'],
        };
        const envVar = a.authConfig?.env_var as string | undefined;
        const key = envVar ? process.env[envVar] : undefined;
        const result = await verifyApiKey(api, key, realFetch);
        results.push({ ...result, apiId: a.id, isActive: a.isActive });
      }

      const summary = {
        total: results.length,
        valid: results.filter((r) => r.verdict === 'VALID').length,
        invalid: results.filter((r) => r.verdict === 'INVALID').length,
        missing: results.filter((r) => r.verdict === 'MISSING').length,
        rateLimited: results.filter((r) => r.verdict === 'RATE_LIMITED').length,
        needsPrefixFix: results.filter((r) => r.needsPrefixFix).map((r) => r.name),
        // 활성화 후보 — 비활성인데 키가 실제로 먹히는 것들. 그대로 activate에 넘기면 된다.
        activatable: results.filter((r) => !r.isActive && r.verdict === 'VALID').map((r) => r.apiId),
      };

      return jsonResponse({
        success: true,
        data: { generatedAt: new Date().toISOString(), includeInactive, summary, results },
      });
    } catch (error) {
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}
