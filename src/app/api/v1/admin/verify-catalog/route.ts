import { createCatalogRepository } from '@/repositories/factory';
import { adminCorsHeaders, verifyAdminKey, withAdminCors } from '@/lib/utils/adminAuth';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';
import {
  runCatalogVerification,
  type HealthFetch,
  type VerifyApi,
} from '@/lib/catalog/verifyRunner';
import type { ApiVerificationStatus } from '@/types/api';

// 배포 런타임에서 실행돼야 외부 API로 실제 라이브 요청을 보낼 수 있다.
export const runtime = 'nodejs';

const realFetch: HealthFetch = async (url) => {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'User-Agent': 'CustomWebService-CatalogVerify/1.0',
        Accept: 'application/json',
      },
    });
    const ct = res.headers.get('content-type') ?? '';
    const bodyText = /json|text|xml/i.test(ct) ? (await res.text()).slice(0, 4000) : '';
    return { status: res.status, bodyText, contentType: ct, elapsedMs: Date.now() - start, networkError: false };
  } catch {
    return { status: 0, bodyText: '', contentType: '', elapsedMs: Date.now() - start, networkError: true };
  }
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: adminCorsHeaders });
}

/**
 * POST /api/v1/admin/verify-catalog (P5.2)
 * 활성 카탈로그 각 API의 GET 엔드포인트를 실제 호출해 verification_status를 갱신한다.
 * working/degraded → verified, broken → broken만, 그리고 현재 값과 다를 때만 DB를 갱신한다
 * (key_gated/unknown은 기존 값 보존 — 일시 장애·키 부재 오판 방지).
 * 관리자 인증 필요(Authorization: Bearer <ADMIN_API_KEY>). 컷오버로 제거된 CI cron의 대체.
 */
export async function POST(request: Request): Promise<Response> {
  const res = await (async () => {
    try {
      verifyAdminKey(request);

      const repo = createCatalogRepository();
      const { items } = await repo.findMany(
        { isActive: true },
        { limit: 200, orderBy: 'name', orderDirection: 'asc' }
      );

      const apis: VerifyApi[] = items.map((a) => ({
        id: a.id,
        name: a.name,
        baseUrl: a.baseUrl,
        authType: a.authType,
        endpoints: a.endpoints as unknown as VerifyApi['endpoints'],
        verificationStatus: (a.verificationStatus ?? 'unverified') as ApiVerificationStatus,
      }));

      const result = await runCatalogVerification(apis, realFetch, async (id, status) => {
        await repo.update(id, { verificationStatus: status });
      });

      return jsonResponse({
        success: true,
        data: {
          generatedAt: new Date().toISOString(),
          summary: {
            checked: result.checked,
            updated: result.updated,
            unchanged: result.unchanged,
            skipped: result.skipped,
          },
          results: result.results,
        },
      });
    } catch (error) {
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}
