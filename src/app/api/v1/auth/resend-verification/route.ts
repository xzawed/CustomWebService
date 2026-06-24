import { getAuthUser } from '@/lib/auth/index';
import { createAuthService } from '@/services/factory';
import { enforceRateLimit } from '@/lib/auth/routeHelpers';
import { AuthRequiredError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    enforceRateLimit(request, `resend:${user.id}`, 3, 60 * 60 * 1000);

    const baseUrl = new URL(request.url).origin;
    await createAuthService().resendVerification(user.id, baseUrl);
    return jsonResponse({ success: true, data: { message: '인증 메일을 다시 보냈습니다.' } });
  } catch (error) {
    return handleApiError(error);
  }
}
