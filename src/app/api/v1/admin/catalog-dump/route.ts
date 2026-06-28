import { createCatalogRepository } from '@/repositories/factory';
import { adminCorsHeaders, verifyAdminKey, withAdminCors } from '@/lib/utils/adminAuth';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';
import type { ApiCatalogItem } from '@/types/api';

// 배포 런타임에서 실행돼야 프로덕션 SQLite(/data/app.db)를 읽는다.
export const runtime = 'nodejs';

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: adminCorsHeaders });
}

/** auth_config 등 민감 필드를 제외하고 시드 동기화 diff에 필요한 안전한 필드만 투영한다. */
function projectRow(a: ApiCatalogItem): Record<string, unknown> {
  return {
    id: a.id,
    name: a.name,
    category: a.category,
    authType: a.authType,
    isActive: a.isActive,
    verificationStatus: a.verificationStatus ?? null,
    verifiedAt: a.verifiedAt ?? null,
    deprecatedAt: a.deprecatedAt,
    successorId: a.successorId,
    requiresProxy: a.requiresProxy,
    apiVersion: a.apiVersion,
  };
}

/**
 * GET /api/v1/admin/catalog-dump
 * 프로덕션 api_catalog 전체 행(활성·비활성 포함)을 시드 동기화 diff용으로 덤프한다.
 * auth_config 등 민감 필드는 제외한 안전 투영만 반환한다. 읽기 전용.
 * 관리자 인증 필요(Authorization: Bearer <ADMIN_API_KEY>).
 */
export async function GET(request: Request): Promise<Response> {
  const res = await (async () => {
    try {
      verifyAdminKey(request);

      const { items, total } = await createCatalogRepository().findMany(
        {},
        { limit: 500, orderBy: 'name', orderDirection: 'asc' },
      );

      const rows = items.map(projectRow);
      const summary = {
        total,
        active: items.filter((a) => a.isActive).length,
        inactive: items.filter((a) => !a.isActive).length,
        byVerificationStatus: items.reduce<Record<string, number>>((acc, a) => {
          const key = a.verificationStatus ?? 'null';
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
      };

      return jsonResponse({
        success: true,
        data: { generatedAt: new Date().toISOString(), summary, items: rows },
      });
    } catch (error) {
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}
