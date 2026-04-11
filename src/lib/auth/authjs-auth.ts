import type { AuthUser } from '@/lib/auth/types';
import { auth } from '@/lib/auth/authjs-config';

export async function getAuthJsUser(): Promise<AuthUser | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    avatarUrl: session.user.image ?? null,
  };
}
