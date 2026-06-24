import { createUserRepository } from '@/repositories/factory';
import { EmailNotVerifiedError } from '@/lib/utils/errors';

/** 이메일 인증 여부를 강제한다. 미인증·미존재 시 EmailNotVerifiedError(403). */
export async function assertEmailVerified(userId: string): Promise<void> {
  const user = await createUserRepository().findById(userId);
  if (!user || !user.emailVerified) throw new EmailNotVerifiedError();
}
