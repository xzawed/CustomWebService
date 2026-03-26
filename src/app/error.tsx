'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6" style={{ background: 'var(--bg-base)' }}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10">
        <AlertTriangle className="h-7 w-7 text-rose-400" />
      </div>
      <h1 className="mt-5 text-xl font-bold text-white">
        문제가 발생했습니다
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        예기치 못한 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
      </p>
      <button
        type="button"
        onClick={reset}
        className="btn-primary mt-8"
      >
        다시 시도
      </button>
    </div>
  );
}
