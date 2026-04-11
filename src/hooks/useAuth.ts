'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut as authJsSignOut } from 'next-auth/react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types/organization';

// ── Supabase path ────────────────────────────────────────────────────────────

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

function useSupabaseAuth() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
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
  }, [supabase, setUser]);

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

// ── Auth.js path ─────────────────────────────────────────────────────────────

function mapAuthJsUser(sessionUser: {
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

function useAuthJsAuth() {
  const { data: session, status } = useSession();

  const isLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated' && session?.user?.id != null;
  const user =
    isAuthenticated && session?.user?.id != null
      ? mapAuthJsUser(session.user as { id: string; email?: string | null; name?: string | null; image?: string | null })
      : null;

  const signOut = async () => {
    await authJsSignOut({ callbackUrl: '/' });
  };

  return {
    user,
    isLoading,
    isAuthenticated,
    signOut,
  };
}

// ── Unified export ────────────────────────────────────────────────────────────

export function useAuth() {
  const supabaseResult = useSupabaseAuth();
  const authJsResult = useAuthJsAuth();
  return process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'authjs'
    ? authJsResult
    : supabaseResult;
}
