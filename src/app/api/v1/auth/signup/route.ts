import { createAuthService } from '@/services/factory';
import { signupSchema } from '@/types/schemas';
import { parseJsonBody, enforceRateLimit, getBaseUrl } from '@/lib/auth/routeHelpers';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';
import { isFeatureEnabled } from '@/lib/config/featureFlags';

export async function POST(request: Request): Promise<Response> {
  try {
    // 레이트리밋보다 먼저 본다 — 가입이 막힌 상태에서 IP 버킷만 소모시킬 이유가 없다.
    // 기존 사용자 로그인·이용에는 영향이 없다(이 스위치는 신규 가입만 막는다).
    if (!isFeatureEnabled('enable_signup')) {
      return jsonResponse(
        {
          success: false,
          error: { code: 'SIGNUP_DISABLED', message: '현재 신규 가입을 받지 않습니다.' },
        },
        { status: 503 },
      );
    }

    enforceRateLimit(request, 'signup', 5, 60 * 60 * 1000);
    const data = await parseJsonBody(request, signupSchema);

    const baseUrl = getBaseUrl(request);
    await createAuthService().signup(data.email, data.password, baseUrl);

    return jsonResponse(
      { success: true, data: { message: '가입이 완료되었습니다. 이메일 인증 링크를 확인해주세요.' } },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
