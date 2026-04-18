'use client';

import type { ResolutionOptions } from '@/types/project';

interface RelevanceGateProps {
  relevanceScore: number;
  reason: string;
  resolutionOptions: ResolutionOptions;
  onSelectContext: (ctx: string) => void;
  onSelectApiCategory: (category: string) => void;
  onSelectCreativeMerge: (merge: string) => void;
  onSkip: () => void;
}

export default function RelevanceGate({
  relevanceScore,
  reason,
  resolutionOptions,
  onSelectContext,
  onSelectApiCategory,
  onSelectCreativeMerge,
  onSkip,
}: RelevanceGateProps) {
  return (
    <div
      className="rounded-xl border p-4 space-y-4"
      style={{ border: '1px solid #f59e0b', background: '#fffbeb' }}
    >
      {/* 헤더 */}
      <div className="flex items-start gap-3">
        <span className="text-xl">⚠️</span>
        <div>
          <p className="font-medium text-sm" style={{ color: '#92400e' }}>
            API와 서비스 설명의 연관성이 낮습니다 ({relevanceScore}점)
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#b45309' }}>
            {reason}
          </p>
        </div>
      </div>

      {/* 3-way resolution 카드들 */}
      <div className="space-y-3">
        {/* 1. 다른 컨텍스트 제안 */}
        {resolutionOptions.suggestedContexts.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              📝 선택한 API에 어울리는 서비스 설명
            </p>
            <div className="space-y-1.5">
              {resolutionOptions.suggestedContexts.map((ctx, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSelectContext(ctx)}
                  className="w-full text-left rounded-lg px-3 py-2.5 text-sm transition-all"
                  style={{
                    background: 'white',
                    border: '1px solid #d97706',
                    color: 'var(--text-primary)',
                  }}
                >
                  {ctx}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2. 다른 API 제안 */}
        {resolutionOptions.suggestedApis.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              🔌 서비스 설명에 어울리는 API 카테고리
            </p>
            <div className="flex flex-wrap gap-2">
              {resolutionOptions.suggestedApis.map((api, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSelectApiCategory(api.category)}
                  className="rounded-full px-3 py-1.5 text-sm"
                  style={{
                    background: 'white',
                    border: '1px solid #d97706',
                    color: '#92400e',
                  }}
                  title={api.reason}
                >
                  {api.category}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3. 창의적 병합 */}
        {resolutionOptions.creativeMerges.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              ✨ API와 서비스를 창의적으로 연결
            </p>
            <div className="space-y-1.5">
              {resolutionOptions.creativeMerges.map((merge, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSelectCreativeMerge(merge)}
                  className="w-full text-left rounded-lg px-3 py-2.5 text-sm transition-all"
                  style={{
                    background: '#fef3c7',
                    border: '1px solid #d97706',
                    color: 'var(--text-primary)',
                  }}
                >
                  {merge}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 그래도 이대로 생성 */}
      <button
        type="button"
        onClick={onSkip}
        className="text-xs underline"
        style={{ color: 'var(--text-muted)' }}
      >
        그래도 현재 설정으로 생성
      </button>
    </div>
  );
}
