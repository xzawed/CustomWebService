import { createCatalogRepository } from '@/repositories/factory';
import { adminCorsHeaders, verifyAdminKey, withAdminCors } from '@/lib/utils/adminAuth';
import { handleApiError, jsonResponse, ValidationError } from '@/lib/utils/errors';
import {
  verifyApiKeyForActivation,
  type ConsistencyResult,
  type KeyCheckApi,
  type KeyFetch,
} from '@/lib/catalog/keyCheck';
import { activateCatalogSchema } from '@/types/schemas';
import { eventBus } from '@/lib/events/eventBus';
import { logger } from '@/lib/utils/logger';

// 배포 런타임에서 실행돼야 sealed env 키가 주입된다 — keys-verify와 동일 이유.
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

interface ActivateOutcome {
  apiId: string;
  name: string;
  envVar: string;
  activated: boolean;
  reason: string;
}

/** 오퍼레이터가 "3회 중 2회 성공" vs "키가 거부됨"을 구분할 수 있게 reason 을 만든다. */
function formatActivationFailureReason(check: ConsistencyResult): string {
  if (check.attempts === 0) {
    return `키 검증 실패(${check.verdict})${check.detail ? ` — ${check.detail}` : ''}`;
  }
  const statusPart =
    check.httpStatus !== undefined && check.httpStatus > 0 ? ` (${check.httpStatus})` : '';
  return `키 검증 실패(${check.verdict}) — ${check.samples}회 중 ${check.successes}회 성공${statusPart}`;
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: adminCorsHeaders });
}

/**
 * POST /api/v1/admin/catalog/activate
 *
 * 비활성 상태인 "플랫폼 키 의존" API를, **라이브 키 연속 검증(N회 VALID)을 통과한 것만** 활성화한다.
 *
 * 왜 이 엔드포인트가 필요한가: `is_active`를 true로 되돌리는 코드 경로가 이 프로젝트에
 * 아예 없었다(부팅 시 키리스 2종 하드코딩 정정이 전부). 그래서 오너가 무료 키를 발급해
 * env에 등록해도 카탈로그·추천·프록시에서 계속 빠졌고, 심지어 `keys-verify`가 활성만
 * 조회해 **검증 대상에도 못 들어갔다**.
 *
 * **1회 프로브로 켜지 않는다.** 단발 VALID 는 간헐 5xx(에어코리아 83%·연속 504)를 놓친다.
 * `verifyApiKeyForActivation` 이 기본 3회·간격 2s 로 연속 성공을 요구한다.
 * 첫 non-VALID 에서 조기 종료해 관리자 요청 시간을 묶는다.
 *
 * body: `{ apiIds?: string[], dryRun?: boolean }`
 * - `apiIds` 생략 → 비활성 키 의존 API 전부가 대상
 * - `dryRun: true` → 연속 검증은 전부 수행하고 쓰지 않는다
 *
 * 참고: `keys-verify` 는 진단용 단발 프로브로 남긴다(쓰기 게이트가 아님).
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
      const { apiIds, dryRun = false } = activateCatalogSchema.parse(body);

      const repo = createCatalogRepository();
      const { items } = await repo.findMany({}, { limit: 200, orderBy: 'name', orderDirection: 'asc' });

      let targets = items.filter(
        (a) =>
          !a.isActive &&
          a.authType === 'api_key' &&
          Boolean(a.authConfig?.env_var) &&
          !a.authConfig?.default_key,
      );
      if (apiIds && apiIds.length > 0) {
        const wanted = new Set(apiIds);
        targets = targets.filter((a) => wanted.has(a.id));
      }

      const outcomes: ActivateOutcome[] = [];
      for (const a of targets) {
        const envVar = (a.authConfig?.env_var as string | undefined) ?? '(none)';
        const key = envVar !== '(none)' ? process.env[envVar] : undefined;

        const api: KeyCheckApi = {
          name: a.name,
          baseUrl: a.baseUrl,
          authConfig: a.authConfig as KeyCheckApi['authConfig'],
          endpoints: a.endpoints as unknown as KeyCheckApi['endpoints'],
        };
        const check = await verifyApiKeyForActivation(api, key, realFetch);

        if (check.verdict !== 'VALID') {
          outcomes.push({
            apiId: a.id,
            name: a.name,
            envVar,
            activated: false,
            reason: formatActivationFailureReason(check),
          });
          continue;
        }

        if (dryRun) {
          outcomes.push({
            apiId: a.id,
            name: a.name,
            envVar,
            activated: false,
            reason: `dryRun — 키 검증 통과 (${check.successes}/${check.samples})`,
          });
          continue;
        }

        await repo.update(a.id, { isActive: true, verificationStatus: 'verified' });
        logger.warn('Catalog API activated by admin', {
          apiId: a.id,
          name: a.name,
          envVar,
          samples: check.samples,
        });
        eventBus.emit({
          type: 'CATALOG_API_ACTIVATED',
          payload: { apiId: a.id, apiName: a.name, envVar },
        });
        outcomes.push({
          apiId: a.id,
          name: a.name,
          envVar,
          activated: true,
          reason: `키 검증 통과 (${check.successes}/${check.samples})`,
        });
      }

      return jsonResponse({
        success: true,
        data: {
          dryRun,
          candidates: targets.length,
          activated: outcomes.filter((o) => o.activated).length,
          outcomes,
        },
      });
    } catch (error) {
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}
