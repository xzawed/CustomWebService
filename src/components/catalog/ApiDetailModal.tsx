'use client';

import { useEffect } from 'react';
import { X, ExternalLink, Globe, Shield, Gauge } from 'lucide-react';
import type { ApiCatalogItem } from '@/types/api';

interface ApiDetailModalProps {
  api: ApiCatalogItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (api: ApiCatalogItem) => void;
  isSelected?: boolean;
}

export function ApiDetailModal({
  api,
  isOpen,
  onClose,
  onSelect,
  isSelected,
}: ApiDetailModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !api) return null;

  const authLabels: Record<string, string> = {
    none: '키 불필요',
    api_key: 'API Key',
    oauth: 'OAuth',
  };

  const methodColors: Record<string, string> = {
    GET: 'bg-emerald-500/15 text-emerald-400',
    POST: 'bg-blue-500/15 text-blue-400',
    PUT: 'bg-amber-500/15 text-amber-400',
    DELETE: 'bg-rose-500/15 text-rose-400',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      />

      {/* Modal */}
      <div
        className="glass relative z-10 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl"
        style={{ background: 'var(--bg-card)' }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 backdrop-blur-md"
          style={{ background: 'rgba(30, 42, 62, 0.9)', borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-lg font-bold text-white">{api.name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Description */}
          <div>
            <p className="text-sm leading-relaxed text-slate-300">{api.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="badge bg-cyan-500/10 text-cyan-400">{api.category}</span>
              <span className="badge gap-1.5 bg-slate-700/50 text-slate-300">
                <Shield className="h-3 w-3" />
                {authLabels[api.authType] ?? api.authType}
              </span>
              {api.rateLimit && (
                <span className="badge gap-1.5 bg-amber-500/10 text-amber-400">
                  <Gauge className="h-3 w-3" />
                  {api.rateLimit}/min
                </span>
              )}
              {api.corsSupported && (
                <span className="badge bg-emerald-500/10 text-emerald-400">CORS</span>
              )}
            </div>
          </div>

          {/* Base URL */}
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Globe className="h-3.5 w-3.5" />
              Base URL
            </h3>
            <code
              className="mt-2 block rounded-lg px-4 py-2.5 text-sm text-cyan-400"
              style={{ background: 'var(--bg-surface)' }}
            >
              {api.baseUrl}
            </code>
          </div>

          {/* Endpoints */}
          {api.endpoints && api.endpoints.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                엔드포인트 ({api.endpoints.length})
              </h3>
              <div className="space-y-3">
                {api.endpoints.map((ep, idx) => {
                  const params = ep.params ?? [];
                  return (
                    <div
                      key={idx}
                      className="rounded-xl p-4"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${methodColors[ep.method] ?? 'bg-slate-700 text-slate-300'}`}
                        >
                          {ep.method}
                        </span>
                        <code className="text-sm text-slate-200">{ep.path}</code>
                      </div>
                      {ep.description && (
                        <p className="mt-1.5 text-xs text-slate-400">{ep.description}</p>
                      )}
                      {params.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            파라미터
                          </p>
                          <ul className="mt-1.5 space-y-1">
                            {params.map((param) => (
                              <li
                                key={param.name}
                                className="flex items-baseline gap-1.5 text-xs text-slate-400"
                              >
                                <code className="text-slate-300">{param.name}</code>
                                {param.required && <span className="text-rose-400">*</span>}
                                <span className="text-slate-600">({param.type})</span>
                                {param.description && (
                                  <span className="text-slate-500">— {param.description}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {ep.responseExample && Object.keys(ep.responseExample).length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            응답 예시
                          </p>
                          <pre
                            className="mt-1.5 max-h-28 overflow-auto rounded-lg p-3 text-xs text-slate-300"
                            style={{ background: 'var(--bg-base)' }}
                          >
                            {JSON.stringify(ep.responseExample, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tags */}
          {api.tags && api.tags.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                태그
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {api.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md px-2 py-0.5 text-[11px] text-slate-400"
                    style={{ background: 'var(--bg-surface)' }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div
            className="flex items-center gap-3 pt-2"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            {onSelect && (
              <button
                type="button"
                onClick={() => {
                  onSelect(api);
                  onClose();
                }}
                className={isSelected ? 'btn-secondary' : 'btn-primary'}
              >
                {isSelected ? '선택됨' : '선택하기'}
              </button>
            )}
            {api.docsUrl && (
              <a
                href={api.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center gap-1.5"
              >
                공식 문서
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
