import { createAuthService } from '@/services/factory';
import { signupSchema } from '@/types/schemas';
import { parseJsonBody, enforceRateLimit } from '@/lib/auth/routeHelpers';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    enforceRateLimit(request, 'signup', 5, 60 * 60 * 1000);
    const data = await parseJsonBody(request, signupSchema);

    const baseUrl = new URL(request.url).origin;
    await createAuthService().signup(data.email, data.password, baseUrl);

    return jsonResponse(
      { success: true, data: { message: '가입이 완료되었습니다. 이메일 인증 링크를 확인해주세요.' } },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
