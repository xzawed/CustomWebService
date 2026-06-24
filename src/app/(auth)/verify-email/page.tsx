'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('유효하지 않은 인증 링크입니다.');
      return;
    }

    let cancelled = false;

    const verify = async () => {
      try {
        const res = await fetch('/api/v1/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setErrorMessage(data?.error?.message ?? '인증 링크가 만료되었거나 유효하지 않습니다.');
          setStatus('error');
          return;
        }
        setStatus('success');
      } catch {
        if (cancelled) return;
        setErrorMessage('인증 처리 중 오류가 발생했습니다.');
        setStatus('error');
      }
    };

    void verify();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-6"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-1/3 h-80 w-80 rounded-full bg-cyan-500/[0.06] blur-[80px]" />
        <div className="absolute -right-32 bottom-1/3 h-80 w-80 rounded-full bg-violet-500/[0.06] blur-[80px]" />
      </div>

      <div className="glass relative w-full max-w-sm rounded-2xl p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">Custom</span>
            <span style={{ color: 'var(--text-primary)' }}>WebService</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">이메일 인증</p>
        </div>

        {status === 'loading' && (
          <p className="text-center text-sm text-slate-400">인증 중...</p>
        )}

        {status === 'success' && (
          <div className="space-y-4 text-center">
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-300">
              이메일 인증 완료! 이제 서비스를 이용할 수 있습니다.
            </div>
            <a
              href="/dashboard"
              className="inline-block rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-lg"
              style={{
                background: 'var(--accent-gradient, linear-gradient(135deg,#06b6d4,#8b5cf6))',
              }}
            >
              대시보드로 이동
            </a>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4 text-center">
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              {errorMessage}
            </div>
            <a href="/login" className="text-sm text-cyan-400 underline">
              로그인 페이지로 돌아가기
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div
          className="relative flex min-h-screen items-center justify-center px-6"
          style={{ background: 'var(--bg-base)' }}
        />
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
