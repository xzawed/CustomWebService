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

/**
 * 서버에 **도달하지 못한** 경우의 문구. 자격증명 오류와 반드시 구분한다 —
 * 같은 문구를 쓰면 사용자가 비밀번호를 의심하며 재시도해 계정 스로틀만 소모한다.
 * 이 문구는 계정 존재 여부와 무관하므로 오라클이 아니다.
 */
const REQUEST_FAILED_MESSAGE =
  '로그인 요청에 실패했습니다. 네트워크 상태를 확인하고 잠시 후 다시 시도해 주세요.';

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
      // 좁은 경로다: providers·csrf 조회는 성공하고 **callback 만 실패**할 때
      // `new URL(data.url)` 이 TypeError 를 던진다. 아래 `!res` 분기가 나머지를 덮는다.
      setCredError(REQUEST_FAILED_MESSAGE);
      setCredLoading(false);
      return;
    }

    // ⚠️ **`signIn` 은 네트워크·서버 도달 실패에 throw 하지 않는다.** (next-auth 5.0.0-beta.32 실측)
    //
    //   fetch 실패 → `fetchData` 가 `catch { logger.error(...); return null }` 로 삼킴
    //   → `getProviders()` 가 null → signIn 은 `window.location.href='/api/auth/error'` 만 쓰고
    //     **`return;`** — 즉 **undefined 로 resolve** 한다(reject 아님).
    //
    // 그래서 undefined 를 성공으로 읽으면 아래 `window.location.assign('/dashboard')` 가 실행되고,
    // 세션이 없어 다시 로그인으로 튕긴다 — **원인 표시가 없는 왕복**이 된다.
    // `AUTH_TRUST_HOST` 누락으로 `/api/auth/*` 가 500 일 때도 같은 경로다.
    //
    // 실측 근거: `fetch` 를 거부시켜 실제 signIn 을 호출하면
    //   reject=false · 반환값=undefined · location.href 쓰기=["/api/auth/error"]
    if (!res) {
      setCredError(REQUEST_FAILED_MESSAGE);
      setCredLoading(false);
      return;
    }

    if (res.error) {
      // 스로틀 초과도 여기로 온다(authorize가 null 반환). 계정 존재 여부가 새지 않도록
      // **항상 같은 문구**여야 한다 — docs/decisions/2026-07-30-login-rate-limit.md
      // 위 두 분기(도달 실패)와 문구를 구분한다 — 같은 문구를 쓰면 사용자가 비밀번호를
      // 의심하며 재시도해 계정 스로틀만 소모한다. 도달 실패 문구는 계정 존재 여부와
      // 무관하므로 오라클이 아니다.
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
