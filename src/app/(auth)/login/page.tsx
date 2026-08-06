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

    let res: Awaited<ReturnType<typeof signIn>>;
    try {
      res = await signIn('credentials', { email, password, redirect: false });
    } catch {
      // signIn은 자격증명 오류를 `res.error`로 돌려주지만 **네트워크·서버 도달 실패는 throw**한다.
      // 이 catch가 없으면 아래가 통째로 실행되지 않아 credLoading이 true로 굳고, 버튼이
      // '로그인 중...'으로 영구 비활성화되며 **에러 문구조차 뜨지 않는다**(새로고침 외 탈출 불가).
      // 자격증명 오류와 문구를 반드시 구분한다 — 같은 문구를 쓰면 사용자가 비밀번호를 의심하며
      // 재시도해 계정 스로틀만 소모한다. 이 문구는 계정 존재 여부와 무관하므로 오라클이 아니다.
      setCredError('로그인 요청에 실패했습니다. 네트워크 상태를 확인하고 잠시 후 다시 시도해 주세요.');
      setCredLoading(false);
      return;
    }

    if (res?.error) {
      // 스로틀 초과도 여기로 온다(authorize가 null 반환). 계정 존재 여부가 새지 않도록
      // **항상 같은 문구**여야 한다 — docs/decisions/2026-07-30-login-rate-limit.md
      setCredError('이메일 또는 비밀번호가 올바르지 않습니다.');
      setCredLoading(false);
      return;
    }

    // 성공 경로는 credLoading을 **의도적으로 true로 둔다.** 페이지를 떠나는 중이며,
    // 여기서 false로 되돌리면 내비게이션이 끝나기 전에 버튼이 다시 눌려 이중 제출이 된다.
    // (finally로 일괄 해제하지 않는 이유가 이것이다 — 실패 경로에서만 해제한다.)
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
