import { getAuthUser } from '@/lib/auth/index';
import { createAuthService } from '@/services/factory';
import { checkRateLimit, getClientIp } from '@/lib/auth/rateLimit';
import { AuthRequiredError, RateLimitError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    const ip = getClientIp(request);
    if (!checkRateLimit(`resend:${user.id}:${ip}`, 3, 60 * 60 * 1000)) throw new RateLimitError();

    const baseUrl = new URL(request.url).origin;
    await createAuthService().resendVerification(user.id, baseUrl);
    return jsonResponse({ success: true, data: { message: '인증 메일을 다시 보냈습니다.' } });
  } catch (error) {
    return handleApiError(error);
  }
}
