'use client';

import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? '요청 처리 중 오류가 발생했습니다.');
        return;
      }
      setDone(true);
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

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
          <p className="mt-2 text-sm text-slate-400">비밀번호를 잊으셨나요?</p>
        </div>

        {done ? (
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-center text-sm text-cyan-300">
            이메일을 보냈습니다. 가입된 이메일인 경우 비밀번호 재설정 링크를 보내드렸습니다.
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
                  htmlFor="email"
                  className="block text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  이메일
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-cyan-500/40"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                  }}
                />
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
                {loading ? '전송 중...' : '재설정 링크 받기'}
              </button>
            </form>
            <p className="mt-6 text-center text-xs text-slate-500">
              비밀번호가 기억나셨나요?{' '}
              <a href="/login" className="text-cyan-400 underline">
                로그인
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
