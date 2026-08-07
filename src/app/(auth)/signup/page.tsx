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
    // `finally`는 **무조건** 실행되어야 한다. 조건부로 만들면(예: `if (!aborted)`) 취소·거부
    // 경로에서 loading이 true로 굳어 버튼이 '가입 중...'으로 영구 비활성화된다.
    // 여기는 성공해도 페이지를 떠나지 않으므로(`done` 화면으로 전환) 일괄 해제가 안전하다.
    try {
      const res = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? '가입 중 오류가 발생했습니다.');
        return;
      }
      setDone(true);
    } catch {
      // fetch는 네트워크 도달 실패 시 throw한다. 이 catch가 없으면 아래 setLoading(false)가
      // 실행되지 않아 버튼이 영구 비활성화되고 에러 문구도 뜨지 않는다.
      setError('가입 요청에 실패했습니다. 네트워크 상태를 확인하고 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
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
