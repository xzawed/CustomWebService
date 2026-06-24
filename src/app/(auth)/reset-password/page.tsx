'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthCard from '@/components/auth/AuthCard';
import AuthError from '@/components/auth/AuthError';
import AuthField from '@/components/auth/AuthField';
import AuthSubmitButton from '@/components/auth/AuthSubmitButton';

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? '비밀번호 재설정 중 오류가 발생했습니다.');
        return;
      }
      setDone(true);
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center px-6"
        style={{ background: 'var(--bg-base)' }}
      >
        <div className="glass relative w-full max-w-sm rounded-2xl p-8 text-center">
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            유효하지 않은 재설정 링크입니다.
          </div>
          <a href="/forgot-password" className="mt-4 inline-block text-sm text-cyan-400 underline">
            비밀번호 재설정 다시 요청하기
          </a>
        </div>
      </div>
    );
  }

  return (
    <AuthCard subtitle="새 비밀번호를 설정하세요">
      {done ? (
        <div className="space-y-4 text-center">
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-300">
            비밀번호가 성공적으로 재설정되었습니다.
          </div>
          <a
            href="/login"
            className="inline-block rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-lg"
            style={{
              background: 'var(--accent-gradient, linear-gradient(135deg,#06b6d4,#8b5cf6))',
            }}
          >
            로그인
          </a>
        </div>
      ) : (
        <>
          <AuthError message={error} />
          <form className="space-y-3" onSubmit={handleSubmit}>
            <AuthField
              id="password"
              label="새 비밀번호"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              hint="8자 이상"
            />
            <AuthSubmitButton loading={loading}>
              {loading ? '저장 중...' : '비밀번호 재설정'}
            </AuthSubmitButton>
          </form>
          <p className="mt-6 text-center text-xs text-slate-500">
            <a href="/login" className="text-cyan-400 underline">
              로그인 페이지로 돌아가기
            </a>
          </p>
        </>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div
          className="relative flex min-h-screen items-center justify-center px-6"
          style={{ background: 'var(--bg-base)' }}
        />
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
