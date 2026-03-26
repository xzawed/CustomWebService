'use client';

import { Sparkles, Loader2, CheckCircle2, XCircle } from 'lucide-react';

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
      <div className="card p-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20">
          <Sparkles className="h-7 w-7 text-cyan-400" />
        </div>
        <h3 className="mt-5 text-lg font-bold text-white">준비 완료!</h3>
        <p className="mt-2 text-sm text-slate-400">
          선택한 {selectedApiCount}개의 API와 입력한 설명을 바탕으로
          <br />
          웹서비스를 자동 생성합니다.
        </p>
        <button
          type="button"
          onClick={onGenerate}
          className="btn-primary mt-8 inline-flex items-center gap-2 px-8 py-3"
        >
          <Sparkles className="h-4 w-4" />
          생성하기
        </button>
      </div>
    );
  }

  if (status === 'generating') {
    return (
      <div className="card p-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/10">
          <Loader2 className="h-7 w-7 animate-spin text-cyan-400" />
        </div>
        <p className="mt-5 text-sm font-medium text-white">{currentStep || '처리 중...'}</p>
        <div
          className="mx-auto mt-5 h-1.5 w-64 overflow-hidden rounded-full"
          style={{ background: 'var(--bg-surface)' }}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">{progress}%</p>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="card p-10 text-center" style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <h3 className="mt-5 text-lg font-bold text-white">생성 완료!</h3>
        <p className="mt-2 text-sm text-slate-400">웹서비스가 성공적으로 생성되었습니다.</p>
        <button
          type="button"
          onClick={onNavigateDashboard}
          className="mt-8 inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all hover:shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
          }}
        >
          대시보드에서 확인하기
        </button>
      </div>
    );
  }

  // status === 'failed'
  return (
    <div className="card p-10 text-center" style={{ borderColor: 'rgba(244, 63, 94, 0.2)' }}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10">
        <XCircle className="h-7 w-7 text-rose-400" />
      </div>
      <h3 className="mt-5 text-lg font-bold text-white">생성 실패</h3>
      <p className="mt-2 text-sm text-rose-400">{error}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-8 inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all hover:shadow-lg"
        style={{
          background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
          boxShadow: '0 2px 8px rgba(244, 63, 94, 0.25)',
        }}
      >
        다시 시도
      </button>
    </div>
  );
}
