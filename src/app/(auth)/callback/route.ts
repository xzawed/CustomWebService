import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logger } from '@/lib/utils/logger';
import { eventBus } from '@/lib/events/eventBus';
import { registerEventPersister } from '@/lib/events/eventPersister';

registerEventPersister();

function safeRedirect(next: string | null): string {
  if (!next) return '/dashboard';
  // Block external URLs, protocol-relative (//) and any scheme (javascript:, data:, etc.)
  if (/^(\/\/|[a-z][a-z0-9+\-.]*:)/i.test(next)) return '/dashboard';
  const ALLOWED = ['/dashboard', '/builder', '/settings', '/projects', '/catalog'];
  return ALLOWED.some((p) => next.startsWith(p)) ? next : '/dashboard';
}

export async function GET(request: Request) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeRedirect(searchParams.get('next'));

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
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (authUser) {
          const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!serviceRoleKey) {
            logger.error('SUPABASE_SERVICE_ROLE_KEY not configured — skipping user record creation', {
              userId: authUser.id,
            });
            return NextResponse.redirect(`${origin}${next}`);
          }
          // Use service role client to bypass RLS for user record creation
          const serviceClient = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey,
            { cookies: { getAll: () => [], setAll: () => {} } }
          );

          const { data: existing } = await serviceClient
            .from('users')
            .select('id')
            .eq('id', authUser.id)
            .single();

          if (!existing) {
            const { error: insertError } = await serviceClient.from('users').insert({
              id: authUser.id,
              email: authUser.email ?? '',
              name:
                (authUser.user_metadata?.full_name as string) ??
                (authUser.user_metadata?.name as string) ??
                null,
              avatar_url: (authUser.user_metadata?.avatar_url as string) ?? null,
              preferences: {},
            });

            if (insertError) {
              logger.error('Failed to create user record in callback', {
                userId: authUser.id,
                email: authUser.email,
                error: insertError.message,
                code: insertError.code,
              });
            } else {
              eventBus.emit({ type: 'USER_SIGNED_UP', payload: { userId: authUser.id } });
            }
          }
        }
      } catch (err) {
        logger.error('User record creation failed in callback', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to login page if code exchange fails
  return NextResponse.redirect(`${origin}/login`);
}
