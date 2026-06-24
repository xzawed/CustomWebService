import { createAuthService } from '@/services/factory';
import { verifyEmailSchema } from '@/types/schemas';
import { parseJsonBody } from '@/lib/auth/routeHelpers';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    const data = await parseJsonBody(request, verifyEmailSchema, '유효하지 않은 링크입니다.');
    await createAuthService().verifyEmail(data.token);
    return jsonResponse({ success: true, data: { message: '이메일 인증이 완료되었습니다.' } });
  } catch (error) {
    return handleApiError(error);
  }
}
