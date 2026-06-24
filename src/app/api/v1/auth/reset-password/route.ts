import { createAuthService } from '@/services/factory';
import { resetPasswordSchema } from '@/types/schemas';
import { ValidationError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('요청 형식이 올바르지 않습니다.');
    }
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('입력값이 올바르지 않습니다.');

    await createAuthService().resetPassword(parsed.data.token, parsed.data.password);
    return jsonResponse({ success: true, data: { message: '비밀번호가 변경되었습니다. 다시 로그인해주세요.' } });
  } catch (error) {
    return handleApiError(error);
  }
}
