'use client';

import { useState } from 'react';
import AuthCard from '@/components/auth/AuthCard';
import AuthError from '@/components/auth/AuthError';
import AuthField from '@/components/auth/AuthField';
import AuthSubmitButton from '@/components/auth/AuthSubmitButton';

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
    <AuthCard subtitle="계정을 만들어 시작하세요">
      {done ? (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-center text-sm text-cyan-300">
          가입이 완료되었습니다. <strong>{email}</strong>로 보낸 이메일 인증 링크를 확인해주세요.
          인증 후 생성·배포 기능을 사용할 수 있습니다.
        </div>
      ) : (
        <>
          <AuthError message={error} />
          <form className="space-y-3" onSubmit={handleSubmit}>
            <AuthField
              id="email"
              label="이메일"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <AuthField
              id="password"
              label="비밀번호"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              hint="8자 이상"
            />
            <AuthSubmitButton loading={loading}>
              {loading ? '가입 중...' : '가입하기'}
            </AuthSubmitButton>
          </form>
          <p className="mt-6 text-center text-xs text-slate-500">
            이미 계정이 있으신가요?{' '}
            <a href="/login" className="text-cyan-400 underline">
              로그인
            </a>
          </p>
        </>
      )}
    </AuthCard>
  );
}
