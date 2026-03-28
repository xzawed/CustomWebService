'use client';

import { MousePointerClick, Search } from 'lucide-react';
import type { BuilderMode } from '@/stores/builderModeStore';

interface BuilderModeToggleProps {
  mode: BuilderMode;
  onChange: (mode: BuilderMode) => void;
}

export default function BuilderModeToggle({ mode, onChange }: BuilderModeToggleProps) {
  return (
    <div className="mb-8 flex flex-col items-center gap-3">
      <p className="text-xs font-medium text-slate-400">빌드 모드 선택</p>
      <div className="inline-flex rounded-xl border border-white/[0.06] bg-[#0f1629] p-1">
        <button
          type="button"
          onClick={() => onChange('api-first')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
            mode === 'api-first'
              ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-400 shadow-lg shadow-cyan-500/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MousePointerClick className="h-4 w-4" />
          API 선택 → 서비스 설명
        </button>
        <button
          type="button"
          onClick={() => onChange('context-first')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
            mode === 'context-first'
              ? 'bg-gradient-to-r from-violet-500/20 to-rose-500/20 text-violet-400 shadow-lg shadow-violet-500/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Search className="h-4 w-4" />
          서비스 설명 → API 자동매칭
        </button>
      </div>
    </div>
  );
}
