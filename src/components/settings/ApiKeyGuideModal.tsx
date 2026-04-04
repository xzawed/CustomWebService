'use client';

import { X, ExternalLink, CheckCircle, Clock } from 'lucide-react';
import type { ApiKeyGuide } from '@/lib/apiKeyGuides';

interface Props {
  apiName: string;
  guide: ApiKeyGuide;
  onClose: () => void;
}

export function ApiKeyGuideModal({ apiName, guide, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="glass relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: 'var(--bg-card)' }}
      >
        {/* 헤더 */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">{apiName} 키 발급 방법</h2>
            <div className="mt-1 flex items-center gap-3 text-sm text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {guide.estimatedTime}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 그룹 안내 */}
        {guide.groupNote && (
          <div
            className="mb-5 rounded-xl p-4 text-sm text-cyan-300"
            style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}
          >
            {guide.groupNote}
          </div>
        )}

        {/* 단계별 안내 */}
        <ol className="mb-5 space-y-4">
          {guide.steps.map((step, i) => (
            <li key={i} className="flex gap-4">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}
              >
                {i + 1}
              </div>
              <div className="pt-0.5">
                <p className="mb-1 font-semibold text-white">{step.title}</p>
                <p className="text-sm leading-relaxed text-slate-300">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* 키 형식 안내 */}
        <div
          className="mb-5 rounded-xl p-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
            복사할 키 이름
          </p>
          <p className="font-semibold text-white">{guide.keyLabel}</p>
          <p className="mt-0.5 text-sm text-slate-400">{guide.keyFormat}</p>
        </div>

        {/* 팁 */}
        {guide.tips && guide.tips.length > 0 && (
          <div className="mb-5 space-y-2">
            {guide.tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-slate-400">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>{tip}</span>
              </div>
            ))}
          </div>
        )}

        {/* 가입하러 가기 버튼 */}
        <a
          href={guide.signupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary flex w-full items-center justify-center gap-2 text-center"
        >
          <ExternalLink className="h-4 w-4" />
          가입하러 가기 (새 탭에서 열림)
        </a>

        <p className="mt-3 text-center text-xs text-slate-500">
          키를 발급받으셨나요? 이 창을 닫고 입력란에 붙여넣으세요.
        </p>
      </div>
    </div>
  );
}
