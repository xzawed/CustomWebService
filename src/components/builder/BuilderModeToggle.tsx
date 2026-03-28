'use client';

import { MousePointerClick, Search, RotateCcw } from 'lucide-react';
import type { BuilderMode } from '@/stores/builderModeStore';

interface BuilderModeToggleProps {
  mode: BuilderMode;
  onReset: () => void;
  disabled?: boolean;
}

export default function BuilderModeToggle({ mode, onReset, disabled }: BuilderModeToggleProps) {
  const isApiFirst = mode === 'api-first';

  return (
    <div className={`mb-6 flex items-center justify-between ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: 'var(--accent-light)', color: 'var(--accent-primary)' }}
        >
          {isApiFirst ? (
            <MousePointerClick className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </div>
        <div>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {isApiFirst ? 'API 직접 선택' : '아이디어로 시작'}
          </span>
          <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            {isApiFirst ? 'API 선택 → 서비스 설명 → 생성' : '서비스 설명 → API 매칭 → 생성'}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onReset}
        disabled={disabled}
        className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
      >
        <RotateCcw className="h-3 w-3" />
        방식 변경
      </button>
    </div>
  );
}
