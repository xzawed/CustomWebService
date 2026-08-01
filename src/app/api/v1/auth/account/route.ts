import { z } from 'zod/v4';
import { getAuthUser } from '@/lib/auth/index';
import { appendAuthSessionClearCookies } from '@/lib/auth/clearAuthSessionCookies';
import { cascadeDeleteUser } from '@/lib/auth/deleteAccountCascade';
import { verifyPassword } from '@/lib/auth/password';
import { enforceRateLimit, parseJsonBody } from '@/lib/auth/routeHelpers';
import { getSqliteDb } from '@/lib/db/sqlite/connection';
import { eventBus } from '@/lib/events/eventBus';
import { createUserRepository } from '@/repositories/factory';
import { AuthRequiredError, handleApiError } from '@/lib/utils/errors';

const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

/**
 * DELETE /api/v1/auth/account — 계정 삭제(비밀번호 재인증).
 * DB 연쇄 삭제만 수행한다(외부 GitHub/Railway 배포 스택은 제거됨).
 */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const sessionUser = await getAuthUser();
    if (!sessionUser) throw new AuthRequiredError();

    // 파괴적 연산 — 탈취 세션 연속 호출 완화 (export/resend와 동일 리미터)
    enforceRateLimit(request, `delete-account:${sessionUser.id}`, 5, 60 * 60 * 1000);

    const { password } = await parseJsonBody(request, deleteAccountSchema, '비밀번호가 필요합니다.');

    const userRepo = createUserRepository();
    const dbUser = await userRepo.findById(sessionUser.id);
    if (!dbUser) throw new AuthRequiredError();

    // 잘못된 비밀번호 → 401, 삭제 없음
    if (!verifyPassword(password, dbUser.passwordHash)) {
      throw new AuthRequiredError();
    }

    const email = dbUser.email;
    const name = dbUser.name;

    cascadeDeleteUser(getSqliteDb(), {
      userId: sessionUser.id,
      email,
      name,
    });

    // PROJECT_DELETED / deletedProjectId 와 동일: payload.userId 금지(persist FK 추출 함정).
    // 커밋 이후 발행 — 삭제된 users 행을 FK로 가리키지 않도록 deletedUserId 사용.
    eventBus.emit({
      type: 'USER_DELETED',
      payload: { deletedUserId: sessionUser.id },
    });

    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
    appendAuthSessionClearCookies(headers);

    return new Response(JSON.stringify({ success: true, data: { deleted: true } }), {
      status: 200,
      headers,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
