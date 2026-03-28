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
        <h1 className="text-3xl font-extrabold text-white sm:text-4xl">
          새 서비스 만들기
        </h1>
        <p className="mt-3 text-base text-slate-400">
          어떤 방식으로 시작하시겠어요?
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-5 sm:grid-cols-2">
        {/* API-first card */}
        <button
          type="button"
          onClick={() => onSelect('api-first')}
          className="group relative flex flex-col rounded-2xl border border-white/[0.06] bg-[#0f1629] p-8 text-left transition-all duration-200 hover:border-cyan-500/40 hover:shadow-[0_0_40px_rgba(0,212,255,0.08)]"
        >
          {/* Icon area */}
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 transition-transform group-hover:scale-110">
            <Layers className="h-7 w-7 text-cyan-400" />
          </div>

          {/* Title */}
          <h2 className="mb-2 text-xl font-bold text-white group-hover:text-cyan-300">
            API를 직접 선택
          </h2>

          {/* Description */}
          <p className="mb-6 flex-1 text-sm leading-relaxed text-slate-400">
            사용하고 싶은 API를 직접 골라서 시작합니다.
            원하는 API 조합으로 나만의 서비스를 구성할 수 있어요.
          </p>

          {/* Flow indicator */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-cyan-400">1</span>
            <span className="text-slate-500">API 선택</span>
            <ArrowRight className="h-3 w-3 text-slate-600" />
            <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-cyan-400">2</span>
            <span className="text-slate-500">서비스 설명</span>
            <ArrowRight className="h-3 w-3 text-slate-600" />
            <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-cyan-400">3</span>
            <span className="text-slate-500">생성</span>
          </div>

          {/* Recommended badge */}
          <div className="absolute right-4 top-4">
            <MousePointerClick className="h-5 w-5 text-slate-600 transition-colors group-hover:text-cyan-400" />
          </div>
        </button>

        {/* Context-first card */}
        <button
          type="button"
          onClick={() => onSelect('context-first')}
          className="group relative flex flex-col rounded-2xl border border-white/[0.06] bg-[#0f1629] p-8 text-left transition-all duration-200 hover:border-violet-500/40 hover:shadow-[0_0_40px_rgba(139,92,246,0.08)]"
        >
          {/* Icon area */}
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-rose-500/20 transition-transform group-hover:scale-110">
            <MessageSquareText className="h-7 w-7 text-violet-400" />
          </div>

          {/* Title */}
          <h2 className="mb-2 text-xl font-bold text-white group-hover:text-violet-300">
            아이디어로 시작
          </h2>

          {/* Description */}
          <p className="mb-6 flex-1 text-sm leading-relaxed text-slate-400">
            만들고 싶은 서비스를 설명하면 AI가 최적의 API를
            자동으로 찾아서 매칭해드립니다.
          </p>

          {/* Flow indicator */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="rounded-full bg-violet-500/10 px-2 py-1 text-violet-400">1</span>
            <span className="text-slate-500">서비스 설명</span>
            <ArrowRight className="h-3 w-3 text-slate-600" />
            <span className="rounded-full bg-violet-500/10 px-2 py-1 text-violet-400">2</span>
            <span className="text-slate-500">API 매칭</span>
            <ArrowRight className="h-3 w-3 text-slate-600" />
            <span className="rounded-full bg-violet-500/10 px-2 py-1 text-violet-400">3</span>
            <span className="text-slate-500">생성</span>
          </div>

          {/* Icon badge */}
          <div className="absolute right-4 top-4">
            <Search className="h-5 w-5 text-slate-600 transition-colors group-hover:text-violet-400" />
          </div>
        </button>
      </div>
    </div>
  );
}
