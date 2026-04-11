import { SupabaseClient } from '@supabase/supabase-js';
import { AuthUser } from '@/lib/auth/types';

export async function getSupabaseAuthUser(supabase: SupabaseClient): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  const user = data.user;

  return {
    id: user.id,
    email: user.email ?? '',
    name:
      (user.user_metadata?.full_name as string) ??
      (user.user_metadata?.name as string) ??
      null,
    avatarUrl: (user.user_metadata?.avatar_url as string) ?? null,
  };
}
