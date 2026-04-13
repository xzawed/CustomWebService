'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut as authJsSignOut } from 'next-auth/react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types/user';

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
  const { user, isLoading, isAuthenticated, setUser } = useAuthStore();
  const supabase = useMemo(
    () => process.env.NEXT_PUBLIC_AUTH_PROVIDER !== 'authjs' ? createClient() : null,
    []
  );

  useEffect(() => {
    if (!supabase) return; // not in supabase mode

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
    if (supabase) await supabase.auth.signOut();
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

function useAuthJsAuth(): ReturnType<typeof useSupabaseAuth> {
  const router = useRouter();
  const { data: session, status } = useSession(); // always called for Rules of Hooks

  const isEnabled = process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'authjs';

  const isLoading = isEnabled ? status === 'loading' : false;
  const isAuthenticated = isEnabled ? status === 'authenticated' && session?.user?.id != null : false;
  const user =
    isEnabled && isAuthenticated && session?.user?.id != null
      ? mapAuthJsUser(session.user as { id: string; email?: string | null; name?: string | null; image?: string | null })
      : null;

  const signOut = async () => {
    if (isEnabled) {
      await authJsSignOut({ callbackUrl: '/' });
    } else {
      router.push('/');
    }
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
