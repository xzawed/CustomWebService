import { adminCorsHeaders, verifyAdminKey, withAdminCors } from '@/lib/utils/adminAuth';
import { handleApiError, jsonResponse, ValidationError } from '@/lib/utils/errors';
import {
  FEATURE_FLAGS,
  listFeatureFlags,
  setFeatureFlag,
  type FeatureFlagName,
} from '@/lib/config/featureFlags';
import { setFeatureFlagSchema } from '@/types/schemas';
import { eventBus } from '@/lib/events/eventBus';
import { logger } from '@/lib/utils/logger';

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: adminCorsHeaders });
}

/** 현재 플래그 상태 조회. */
export async function GET(request: Request): Promise<Response> {
  const res = await (async () => {
    try {
      verifyAdminKey(request);
      return jsonResponse({
        success: true,
        data: { known: FEATURE_FLAGS, flags: listFeatureFlags() },
      });
    } catch (error) {
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}

/**
 * 킬스위치를 내리거나 올린다.
 *
 * 알려진 플래그만 허용한다 — 오타로 만들어진 행은 아무도 읽지 않으면서
 * "스위치를 내렸다"는 착각만 남긴다. 인시던트 중엔 그게 제일 위험하다.
 */
export async function POST(request: Request): Promise<Response> {
  const res = await (async () => {
    try {
      verifyAdminKey(request);

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new ValidationError('잘못된 요청 형식입니다.');
      }
      const { flag, enabled } = setFeatureFlagSchema.parse(body);

      setFeatureFlag(flag as FeatureFlagName, enabled);

      // 감사 로그 — 누가 언제 무엇을 껐는지가 사후에 가장 궁금해진다.
      logger.warn('Feature flag changed by admin', { flag, enabled });
      eventBus.emit({
        type: 'FEATURE_FLAG_CHANGED',
        payload: { flag, enabled },
      });

      return jsonResponse({ success: true, data: { flag, enabled } });
    } catch (error) {
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}
