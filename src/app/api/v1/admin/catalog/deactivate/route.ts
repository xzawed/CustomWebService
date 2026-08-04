import { createCatalogRepository } from '@/repositories/factory';
import { adminCorsHeaders, verifyAdminKey, withAdminCors } from '@/lib/utils/adminAuth';
import { handleApiError, jsonResponse, ValidationError } from '@/lib/utils/errors';
import { deactivateCatalogSchema } from '@/types/schemas';
import { eventBus } from '@/lib/events/eventBus';
import { logger } from '@/lib/utils/logger';

// 배포 런타임에서 실행 (activate와 동일 — nodejs runtime 고정).
export const runtime = 'nodejs';

interface DeactivateOutcome {
  apiId: string;
  name: string;
  envVar: string;
  deactivated: boolean;
  reason: string;
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: adminCorsHeaders });
}

/**
 * POST /api/v1/admin/catalog/deactivate
 *
 * 지정한 활성 카탈로그 API를 **라이브 키 검증 없이** 비활성화한다.
 * 업스트림 장애·키 미설정 상태에서도 오너가 잘못 시드된·문제가 된 API를 즉시 끌 수 있어야 한다.
 *
 * activate와 대칭이되 다음이 다르다:
 * - `apiIds` 필수·비어 있으면 400 (omit=전부 끔 미구현 — 실수 방지)
 * - 플랫폼 키 의존 여부와 무관 — 키리스 활성 API도 대상
 * - `isActive: false`만 기록. `verificationStatus`는 건드리지 않음 (왜 껐는지 증거 보존)
 *
 * body: `{ apiIds: string[], dryRun?: boolean }`
 */
export async function POST(request: Request): Promise<Response> {
  const res = await (async () => {
    try {
      verifyAdminKey(request);

      let body: unknown = {};
      try {
        const text = await request.text();
        if (text.trim()) body = JSON.parse(text);
      } catch {
        throw new ValidationError('잘못된 요청 형식입니다.');
      }
      const { apiIds, dryRun = false } = deactivateCatalogSchema.parse(body);

      const repo = createCatalogRepository();
      const { items } = await repo.findMany({}, { limit: 200, orderBy: 'name', orderDirection: 'asc' });
      const byId = new Map(items.map((a) => [a.id, a]));

      const outcomes: DeactivateOutcome[] = [];
      for (const apiId of apiIds) {
        const a = byId.get(apiId);
        if (!a) {
          outcomes.push({
            apiId,
            name: '(unknown)',
            envVar: '(none)',
            deactivated: false,
            reason: '존재하지 않는 API ID',
          });
          continue;
        }

        const envVar = (a.authConfig?.env_var as string | undefined) ?? '(none)';

        if (!a.isActive) {
          outcomes.push({
            apiId: a.id,
            name: a.name,
            envVar,
            deactivated: false,
            reason: '이미 비활성',
          });
          continue;
        }

        if (dryRun) {
          outcomes.push({
            apiId: a.id,
            name: a.name,
            envVar,
            deactivated: false,
            reason: 'dryRun — 비활성화하지 않음',
          });
          continue;
        }

        // verificationStatus는 보존 — 끈 이유(broken 등)를 남겨 둔다.
        await repo.update(a.id, { isActive: false });
        logger.warn('Catalog API deactivated by admin', { apiId: a.id, name: a.name, envVar });
        eventBus.emit({
          type: 'CATALOG_API_DEACTIVATED',
          payload: { apiId: a.id, apiName: a.name, envVar },
        });
        outcomes.push({
          apiId: a.id,
          name: a.name,
          envVar,
          deactivated: true,
          reason: '비활성화 완료',
        });
      }

      return jsonResponse({
        success: true,
        data: {
          dryRun,
          requested: apiIds.length,
          deactivated: outcomes.filter((o) => o.deactivated).length,
          outcomes,
        },
      });
    } catch (error) {
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}
