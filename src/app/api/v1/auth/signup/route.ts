import { createAuthService } from '@/services/factory';
import { signupSchema } from '@/types/schemas';
import { checkRateLimit, getClientIp } from '@/lib/auth/rateLimit';
import { ValidationError, RateLimitError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(`signup:${ip}`, 5, 60 * 60 * 1000)) throw new RateLimitError();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('요청 형식이 올바르지 않습니다.');
    }
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('입력값이 올바르지 않습니다.');

    const baseUrl = new URL(request.url).origin;
    await createAuthService().signup(parsed.data.email, parsed.data.password, baseUrl);

    return jsonResponse(
      { success: true, data: { message: '가입이 완료되었습니다. 이메일 인증 링크를 확인해주세요.' } },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
