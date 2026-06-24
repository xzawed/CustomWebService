'use client';

import { useState } from 'react';
import AuthCard from '@/components/auth/AuthCard';
import AuthError from '@/components/auth/AuthError';
import AuthField from '@/components/auth/AuthField';
import AuthSubmitButton from '@/components/auth/AuthSubmitButton';

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
    <AuthCard subtitle="비밀번호를 잊으셨나요?">
      {done ? (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-center text-sm text-cyan-300">
          이메일을 보냈습니다. 가입된 이메일인 경우 비밀번호 재설정 링크를 보내드렸습니다.
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
            <AuthSubmitButton loading={loading}>
              {loading ? '전송 중...' : '재설정 링크 받기'}
            </AuthSubmitButton>
          </form>
          <p className="mt-6 text-center text-xs text-slate-500">
            비밀번호가 기억나셨나요?{' '}
            <a href="/login" className="text-cyan-400 underline">
              로그인
            </a>
          </p>
        </>
      )}
    </AuthCard>
  );
}
