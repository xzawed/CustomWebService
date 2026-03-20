import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a minimal mock during build/SSG when env vars are missing
    return createBrowserClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    );
  }

  return createBrowserClient(url, key);
}
