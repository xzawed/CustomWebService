'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types/organization';

function mapSupabaseUser(supabaseUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): User {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    name:
      (supabaseUser.user_metadata?.full_name as string) ??
      (supabaseUser.user_metadata?.name as string) ??
      null,
    avatarUrl: (supabaseUser.user_metadata?.avatar_url as string) ?? null,
    preferences: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function useAuth() {
  const router = useRouter();
  const supabase = createClient();
  const { user, isLoading, isAuthenticated, setUser } = useAuthStore();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(mapSupabaseUser(session.user));
      } else {
        setUser(null);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(mapSupabaseUser(session.user));
      } else {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase.auth, setUser]);

  const signOut = async () => {
    await supabase.auth.signOut();
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
