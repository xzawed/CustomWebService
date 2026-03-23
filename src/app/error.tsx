'use client';

import { useEffect } from 'react';

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <p className="text-6xl font-bold text-red-500">500</p>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">
        문제가 발생했습니다
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        예기치 못한 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        다시 시도
      </button>
    </div>
  );
}
