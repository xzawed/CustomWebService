import { createAuthService } from '@/services/factory';
import { forgotPasswordSchema } from '@/types/schemas';
import { parseJsonBody, enforceRateLimit, getBaseUrl } from '@/lib/auth/routeHelpers';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    enforceRateLimit(request, 'forgot', 5, 60 * 60 * 1000);
    const data = await parseJsonBody(request, forgotPasswordSchema, '이메일 형식이 올바르지 않습니다.');

    const baseUrl = getBaseUrl(request);
    await createAuthService().requestPasswordReset(data.email, baseUrl);

    // enumeration 방지: 존재 여부와 무관하게 동일 응답
    return jsonResponse({ success: true, data: { message: '재설정 링크를 이메일로 보냈습니다(가입된 경우).' } });
  } catch (error) {
    return handleApiError(error);
  }
}
