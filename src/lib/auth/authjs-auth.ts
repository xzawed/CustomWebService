// authjs-config는 모듈 로드 시 getDb()(pg/drizzle, Node 전용)를 호출하므로 정적 import하지 않는다.
// 정적 import 시 이 모듈을 import하는 것만으로 Node 전용 그래프가 Edge Runtime(middleware)에
// 유입되어 크래시한다. 동적 import로 호출 시점까지 로딩을 지연시켜 정적 체인을 끊는다.
// (AUTH_PROVIDER=authjs 전용 경로 — 현재 기본은 supabase이며 이 경로는 비활성.)
import type { AuthUser } from '@/lib/auth/types';

export async function getAuthJsUser(): Promise<AuthUser | null> {
  const { auth } = await import('@/lib/auth/authjs-config');
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    avatarUrl: session.user.image ?? null,
  };
}
