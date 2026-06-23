'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut as authJsSignOut } from 'next-auth/react';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types/user';

function mapSessionUser(sessionUser: {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}): User {
  return {
    id: sessionUser.id,
    email: sessionUser.email ?? '',
    name: sessionUser.name ?? null,
    avatarUrl: sessionUser.image ?? null,
    preferences: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 인증 상태 훅 — Auth.js(JWT, local) 세션 단일 경로.
 * next-auth 세션을 authStore에 동기화(컴포넌트는 authStore에서 user/isAuthenticated를 읽는다)하고
 * signOut을 제공한다. `<SessionProvider>`(app/layout.tsx)가 마운트되어 있어야 세션이 채워진다.
 */
export function useAuth() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, setUser } = useAuthStore();
  const sessionResult = useSession();
  const session = sessionResult?.data ?? null;
  const status = sessionResult?.status ?? 'unauthenticated';

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'authenticated' && session?.user?.id != null) {
      setUser(
        mapSessionUser(
          session.user as { id: string; email?: string | null; name?: string | null; image?: string | null },
        ),
      );
    } else {
      setUser(null);
    }
  }, [status, session, setUser]);

  const signOut = async () => {
    await authJsSignOut({ callbackUrl: '/' });
    setUser(null);
    router.push('/');
  };

  return {
    user,
    isLoading,
    isAuthenticated,
    signOut,
  };
}
