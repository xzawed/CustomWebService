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
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: 'var(--grad-subtle)' }}
        >
          <Sparkles className="h-7 w-7" style={{ color: 'var(--accent-primary)' }} />
        </div>
        <h3 className="mt-5 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>준비 완료!</h3>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
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
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: 'var(--accent-light)' }}
        >
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: 'var(--accent-primary)' }} />
        </div>
        <p className="mt-5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{currentStep || '처리 중...'}</p>
        <div
          className="mx-auto mt-5 h-1.5 w-64 overflow-hidden rounded-full"
          style={{ background: 'var(--bg-surface)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: 'var(--grad-primary)' }}
          />
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{progress}%</p>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="card p-10 text-center" style={{ borderColor: 'rgba(16,185,129,0.25)' }}>
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(16,185,129,0.12)' }}
        >
          <CheckCircle2 className="h-7 w-7" style={{ color: '#059669' }} />
        </div>
        <h3 className="mt-5 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>생성 완료!</h3>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>웹서비스가 성공적으로 생성되었습니다.</p>
        <button
          type="button"
          onClick={onNavigateDashboard}
          className="mt-8 inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all hover:shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            boxShadow: '0 2px 8px rgba(16,185,129,0.25)',
          }}
        >
          대시보드에서 확인하기
        </button>
      </div>
    );
  }

  // status === 'failed'
  return (
    <div className="card p-10 text-center" style={{ borderColor: 'rgba(225,29,72,0.25)' }}>
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: 'rgba(225,29,72,0.10)' }}
      >
        <XCircle className="h-7 w-7" style={{ color: '#e11d48' }} />
      </div>
      <h3 className="mt-5 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>생성 실패</h3>
      <p className="mt-2 text-sm" style={{ color: '#e11d48' }}>{error}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-8 inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all hover:shadow-lg"
        style={{
          background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
          boxShadow: '0 2px 8px rgba(225,29,72,0.25)',
        }}
      >
        다시 시도
      </button>
    </div>
  );
}
