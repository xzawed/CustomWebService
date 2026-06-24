import { createAuthService } from '@/services/factory';
import { forgotPasswordSchema } from '@/types/schemas';
import { checkRateLimit, getClientIp } from '@/lib/auth/rateLimit';
import { ValidationError, RateLimitError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(`forgot:${ip}`, 5, 60 * 60 * 1000)) throw new RateLimitError();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('요청 형식이 올바르지 않습니다.');
    }
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('이메일 형식이 올바르지 않습니다.');

    const baseUrl = new URL(request.url).origin;
    await createAuthService().requestPasswordReset(parsed.data.email, baseUrl);

    // enumeration 방지: 존재 여부와 무관하게 동일 응답
    return jsonResponse({ success: true, data: { message: '재설정 링크를 이메일로 보냈습니다(가입된 경우).' } });
  } catch (error) {
    return handleApiError(error);
  }
}
