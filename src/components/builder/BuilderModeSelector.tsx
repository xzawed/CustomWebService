'use client';

import { MousePointerClick, Search, ArrowRight, Layers, MessageSquareText } from 'lucide-react';
import type { BuilderMode } from '@/stores/builderModeStore';

interface BuilderModeSelectorProps {
  onSelect: (mode: BuilderMode) => void;
}

export default function BuilderModeSelector({ onSelect }: BuilderModeSelectorProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-extrabold sm:text-4xl" style={{ color: 'var(--text-primary)' }}>
          새 서비스 만들기
        </h1>
        <p className="mt-3 text-base" style={{ color: 'var(--text-secondary)' }}>
          어떤 방식으로 시작하시겠어요?
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-5 sm:grid-cols-2">
        {/* API-first card */}
        <button
          type="button"
          onClick={() => onSelect('api-first')}
          className="card group relative flex flex-col p-8 text-left"
        >
          <div
            className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl transition-transform group-hover:scale-110"
            style={{ background: 'var(--grad-subtle)' }}
          >
            <Layers className="h-7 w-7" style={{ color: 'var(--accent-primary)' }} />
          </div>

          <h2 className="mb-2 text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            API를 직접 선택
          </h2>

          <p className="mb-6 flex-1 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            사용하고 싶은 API를 직접 골라서 시작합니다.
            원하는 API 조합으로 나만의 서비스를 구성할 수 있어요.
          </p>

          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="rounded-full px-2 py-1" style={{ background: 'var(--accent-light)', color: 'var(--accent-primary)' }}>1</span>
            <span style={{ color: 'var(--text-muted)' }}>API 선택</span>
            <ArrowRight className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
            <span className="rounded-full px-2 py-1" style={{ background: 'var(--accent-light)', color: 'var(--accent-primary)' }}>2</span>
            <span style={{ color: 'var(--text-muted)' }}>서비스 설명</span>
            <ArrowRight className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
            <span className="rounded-full px-2 py-1" style={{ background: 'var(--accent-light)', color: 'var(--accent-primary)' }}>3</span>
            <span style={{ color: 'var(--text-muted)' }}>생성</span>
          </div>

          <div className="absolute right-4 top-4">
            <MousePointerClick className="h-5 w-5 transition-colors" style={{ color: 'var(--text-muted)' }} />
          </div>
        </button>

        {/* Context-first card */}
        <button
          type="button"
          onClick={() => onSelect('context-first')}
          className="card group relative flex flex-col p-8 text-left"
        >
          <div
            className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl transition-transform group-hover:scale-110"
            style={{ background: 'var(--grad-subtle)' }}
          >
            <MessageSquareText className="h-7 w-7" style={{ color: 'var(--accent-secondary)' }} />
          </div>

          <h2 className="mb-2 text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            아이디어로 시작
          </h2>

          <p className="mb-6 flex-1 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            만들고 싶은 서비스를 설명하면 AI가 최적의 API를
            자동으로 찾아서 매칭해드립니다.
          </p>

          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="rounded-full px-2 py-1" style={{ background: 'var(--accent-light)', color: 'var(--accent-secondary)' }}>1</span>
            <span style={{ color: 'var(--text-muted)' }}>서비스 설명</span>
            <ArrowRight className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
            <span className="rounded-full px-2 py-1" style={{ background: 'var(--accent-light)', color: 'var(--accent-secondary)' }}>2</span>
            <span style={{ color: 'var(--text-muted)' }}>API 매칭</span>
            <ArrowRight className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
            <span className="rounded-full px-2 py-1" style={{ background: 'var(--accent-light)', color: 'var(--accent-secondary)' }}>3</span>
            <span style={{ color: 'var(--text-muted)' }}>생성</span>
          </div>

          <div className="absolute right-4 top-4">
            <Search className="h-5 w-5 transition-colors" style={{ color: 'var(--text-muted)' }} />
          </div>
        </button>
      </div>
    </div>
  );
}
