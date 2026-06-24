'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ResetPasswordPage() {
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
          <p className="mt-2 text-sm text-slate-400">새 비밀번호를 설정하세요</p>
        </div>

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
            {error && (
              <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-400">
                {error}
              </div>
            )}
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  새 비밀번호
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-cyan-500/40"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                  }}
                />
                <p className="text-[11px] text-slate-500">8자 이상</p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: 'var(--accent-gradient, linear-gradient(135deg,#06b6d4,#8b5cf6))',
                  color: '#fff',
                }}
              >
                {loading ? '저장 중...' : '비밀번호 재설정'}
              </button>
            </form>
            <p className="mt-6 text-center text-xs text-slate-500">
              <a href="/login" className="text-cyan-400 underline">
                로그인 페이지로 돌아가기
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
