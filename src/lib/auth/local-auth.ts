// local-auth-config는 NextAuth를 module-load 시 초기화하므로 정적 import하지 않는다.
// AUTH_PROVIDER=local 경로에서 호출 시점에 동적 import한다(supabase 모드 무영향).
import type { AuthUser } from '@/lib/auth/types';

export async function getLocalAuthUser(): Promise<AuthUser | null> {
  const { auth } = await import('@/lib/auth/local-auth-config');
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    avatarUrl: session.user.image ?? null,
  };
}
