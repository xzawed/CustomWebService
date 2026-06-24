import { createAuthService } from '@/services/factory';
import { verifyEmailSchema } from '@/types/schemas';
import { ValidationError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('요청 형식이 올바르지 않습니다.');
    }
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('유효하지 않은 링크입니다.');

    await createAuthService().verifyEmail(parsed.data.token);
    return jsonResponse({ success: true, data: { message: '이메일 인증이 완료되었습니다.' } });
  } catch (error) {
    return handleApiError(error);
  }
}
