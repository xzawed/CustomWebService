import { getAuthUser } from '@/lib/auth/index';
import { createUserRepository } from '@/repositories/factory';
import { AuthRequiredError, handleApiError, jsonResponse } from '@/lib/utils/errors';

/** GET /api/v1/auth/status — 현재 사용자의 이메일 인증 여부 반환 */
export async function GET(): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();
    const dbUser = await createUserRepository().findById(user.id);
    return jsonResponse({ success: true, data: { verified: Boolean(dbUser?.emailVerified) } });
  } catch (error) {
    return handleApiError(error);
  }
}
