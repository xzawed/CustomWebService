import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { UserRepository } from '@/repositories/userRepository';

export async function GET(request: Request) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  // Use NEXT_PUBLIC_APP_URL if set to avoid 0.0.0.0 binding address issues
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? requestOrigin;

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing user sessions.
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Ensure user record exists in users table
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const userRepo = new UserRepository(supabase);
        const existing = await userRepo.findById(authUser.id);
        if (!existing) {
          await userRepo.createWithAuthId(authUser.id, {
            email: authUser.email ?? '',
            name:
              (authUser.user_metadata?.full_name as string) ??
              (authUser.user_metadata?.name as string) ??
              null,
            avatarUrl: (authUser.user_metadata?.avatar_url as string) ?? null,
            preferences: {},
          } as Omit<import('@/types/organization').User, 'id' | 'createdAt' | 'updatedAt'>);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to login page if code exchange fails
  return NextResponse.redirect(`${origin}/login`);
}
