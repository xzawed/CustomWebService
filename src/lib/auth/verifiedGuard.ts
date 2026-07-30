import { createUserRepository } from '@/repositories/factory';
import { AuthRequiredError, EmailNotVerifiedError } from '@/lib/utils/errors';

/** 이메일 인증을 강제한다. 미존재 → 401, 미인증 → 403. */
export async function assertEmailVerified(userId: string): Promise<void> {
  const user = await createUserRepository().findById(userId);
  if (!user) throw new AuthRequiredError();
  if (!user.emailVerified) throw new EmailNotVerifiedError();
}
