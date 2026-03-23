'use client';

import { Sparkles, Loader2 } from 'lucide-react';

type GenerationStatus = 'idle' | 'generating' | 'completed' | 'failed';

interface GenerationProgressProps {
  status: GenerationStatus;
  progress: number;
  currentStep: string;
  error: string | null;
  selectedApiCount: number;
  onGenerate: () => void;
  onRetry: () => void;
  onNavigateDashboard: () => void;
}

export default function GenerationProgress({
  status,
  progress,
  currentStep,
  error,
  selectedApiCount,
  onGenerate,
  onRetry,
  onNavigateDashboard,
}: GenerationProgressProps) {
  if (status === 'idle') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <Sparkles className="mx-auto h-12 w-12 text-blue-600" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">준비 완료!</h3>
        <p className="mt-2 text-sm text-gray-500">
          선택한 {selectedApiCount}개의 API와 입력한 설명을 바탕으로 웹서비스를 자동 생성합니다.
        </p>
        <button
          type="button"
          onClick={onGenerate}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl"
        >
          <Sparkles className="h-4 w-4" />
          생성하기
        </button>
      </div>
    );
  }

  if (status === 'generating') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
        <p className="mt-4 text-sm font-medium text-gray-700">
          {currentStep || '처리 중...'}
        </p>
        <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-400">{progress}%</p>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-semibold text-green-900">생성 완료!</h3>
        <p className="mt-2 text-sm text-green-700">웹서비스가 성공적으로 생성되었습니다.</p>
        <button
          type="button"
          onClick={onNavigateDashboard}
          className="mt-6 rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700"
        >
          대시보드에서 확인하기
        </button>
      </div>
    );
  }

  // status === 'failed'
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
        <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-red-900">생성 실패</h3>
      <p className="mt-2 text-sm text-red-700">{error}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700"
      >
        다시 시도
      </button>
    </div>
  );
}
