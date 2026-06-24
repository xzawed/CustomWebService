'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import AuthCard from '@/components/auth/AuthCard';

function getSafeRedirectParam(): string | null {
  const redirect = new URLSearchParams(window.location.search).get('redirect');
  if (!redirect) return null;
  if (/^(\/\/|[a-z][a-z0-9+\-.]*:)/i.test(redirect)) return null;
  return redirect.startsWith('/') ? redirect : null;
}

export default function LoginPage() {
  // 셀프호스트 단일 관리자 — Auth.js Credentials(이메일/비번) 로그인.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [credError, setCredError] = useState<string | null>(null);
  const [credLoading, setCredLoading] = useState(false);

  const handleCredentialsLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCredError(null);
    setCredLoading(true);

    const res = await signIn('credentials', { email, password, redirect: false });

    if (res?.error) {
      setCredError('이메일 또는 비밀번호가 올바르지 않습니다.');
      setCredLoading(false);
      return;
    }

    window.location.assign(getSafeRedirectParam() ?? '/dashboard');
  };

  return (
    <AuthCard subtitle="무료 API로 나만의 웹서비스를 만드세요">
      {credError && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-400">
          {credError}
        </div>
      )}

      <form className="space-y-3" onSubmit={handleCredentialsLogin}>
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
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
              style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-cyan-500/40"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
            />
          </div>
          <button
            type="submit"
            disabled={credLoading}
            className="flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'var(--accent-gradient, linear-gradient(135deg,#06b6d4,#8b5cf6))', color: '#fff' }}
          >
            {credLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>

      <div className="mt-6 flex items-center justify-between text-xs">
        <a href="/signup" className="text-cyan-400 underline">회원가입</a>
        <a href="/forgot-password" className="text-slate-400 underline">비밀번호를 잊으셨나요?</a>
      </div>

      <p className="mt-6 text-center text-[11px] text-slate-500">
        로그인하면 <span className="text-slate-400 underline">이용약관</span>에 동의하는 것으로
        간주됩니다.
      </p>
    </AuthCard>
  );
}
