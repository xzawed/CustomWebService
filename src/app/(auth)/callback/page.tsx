'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const code = searchParams.get('code');

    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            router.replace('/login');
          } else {
            router.replace('/dashboard');
          }
        })
        .catch(() => {
          router.replace('/login');
        });
    } else {
      router.replace('/login');
    }
  }, [searchParams, supabase.auth, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="mt-4 text-sm text-gray-500">로그인 처리 중...</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
