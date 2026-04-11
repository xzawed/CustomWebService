import { getAuthProvider } from '@/lib/config/providers';
import type { AuthUser } from '@/lib/auth/types';

export type { AuthUser };

export async function getAuthUser(): Promise<AuthUser | null> {
  const provider = getAuthProvider();

  if (provider === 'authjs') {
    const { getAuthJsUser } = await import('@/lib/auth/authjs-auth');
    return getAuthJsUser();
  }

  // Default: Supabase
  const { createClient } = await import('@/lib/supabase/server');
  const { getSupabaseAuthUser } = await import('@/lib/auth/supabase-auth');
  const supabase = await createClient();
  return getSupabaseAuthUser(supabase);
}
