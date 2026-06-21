import { createServiceClient } from '@/lib/supabase/server';
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

interface CatalogRow {
  name: string;
  base_url: string;
  auth_config: KeyCheckApi['authConfig'] & { default_key?: string };
  endpoints: KeyCheckApi['endpoints'];
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: adminCorsHeaders });
}

/**
 * GET /api/v1/admin/keys-verify
 * 활성 "플랫폼 키 의존" API(api_key + auth_config.env_var, default_key 없음)의 키 유효성을
 * 배포 런타임의 env 키로 실제 인증 요청을 보내 검증한다. 키 값은 응답에 노출하지 않는다.
 * 관리자 인증 필요(Authorization: Bearer <ADMIN_API_KEY>).
 */
export async function GET(request: Request): Promise<Response> {
  const res = await (async () => {
    try {
      verifyAdminKey(request);

      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from('api_catalog')
        .select('name, base_url, auth_type, auth_config, endpoints')
        .eq('is_active', true)
        .eq('auth_type', 'api_key')
        .order('name', { ascending: true });
      if (error) throw error;

      const keyed = ((data ?? []) as CatalogRow[]).filter(
        (a) => a.auth_config?.env_var && !a.auth_config?.default_key,
      );

      const results: KeyCheckResult[] = [];
      for (const a of keyed) {
        const api: KeyCheckApi = {
          name: a.name,
          baseUrl: a.base_url,
          authConfig: a.auth_config,
          endpoints: a.endpoints,
        };
        const key = a.auth_config?.env_var ? process.env[a.auth_config.env_var] : undefined;
        results.push(await verifyApiKey(api, key, realFetch));
      }

      const summary = {
        total: results.length,
        valid: results.filter((r) => r.verdict === 'VALID').length,
        invalid: results.filter((r) => r.verdict === 'INVALID').length,
        missing: results.filter((r) => r.verdict === 'MISSING').length,
        rateLimited: results.filter((r) => r.verdict === 'RATE_LIMITED').length,
        needsPrefixFix: results.filter((r) => r.needsPrefixFix).map((r) => r.name),
      };

      return jsonResponse({
        success: true,
        data: { generatedAt: new Date().toISOString(), summary, results },
      });
    } catch (error) {
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}
