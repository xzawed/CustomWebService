'use client';

import { useState } from 'react';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error?.message ?? '가입 중 오류가 발생했습니다.');
      return;
    }
    setDone(true);
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
          <p className="mt-2 text-sm text-slate-400">계정을 만들어 시작하세요</p>
        </div>

        {done ? (
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-center text-sm text-cyan-300">
            가입이 완료되었습니다. <strong>{email}</strong>로 보낸 이메일 인증 링크를 확인해주세요.
            인증 후 생성·배포 기능을 사용할 수 있습니다.
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
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  비밀번호
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
                {loading ? '가입 중...' : '가입하기'}
              </button>
            </form>
            <p className="mt-6 text-center text-xs text-slate-500">
              이미 계정이 있으신가요?{' '}
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
