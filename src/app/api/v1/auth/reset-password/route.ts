import { createAuthService } from '@/services/factory';
import { resetPasswordSchema } from '@/types/schemas';
import { parseJsonBody } from '@/lib/auth/routeHelpers';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    const data = await parseJsonBody(request, resetPasswordSchema);
    await createAuthService().resetPassword(data.token, data.password);
    return jsonResponse({ success: true, data: { message: '비밀번호가 변경되었습니다. 다시 로그인해주세요.' } });
  } catch (error) {
    return handleApiError(error);
  }
}
