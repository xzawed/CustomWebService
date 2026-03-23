'use client';

import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
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
    none: '인증 불필요',
    api_key: 'API Key',
    oauth: 'OAuth',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        role="presentation"
      />
      <div className="relative z-10 mx-4 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">{api.name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Basic Info */}
          <div>
            <p className="text-sm text-gray-600">{api.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                {api.category}
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                {authLabels[api.authType] ?? api.authType}
              </span>
              {api.rateLimit && (
                <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                  {api.rateLimit}
                </span>
              )}
            </div>
          </div>

          {/* Base URL */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Base URL</h3>
            <code className="mt-1 block rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-800">
              {api.baseUrl}
            </code>
          </div>

          {/* Endpoints */}
          {api.endpoints.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">
                엔드포인트 ({api.endpoints.length})
              </h3>
              <div className="space-y-3">
                {api.endpoints.map((ep, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-gray-200 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                          ep.method === 'GET'
                            ? 'bg-green-100 text-green-700'
                            : ep.method === 'POST'
                              ? 'bg-blue-100 text-blue-700'
                              : ep.method === 'PUT'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {ep.method}
                      </span>
                      <code className="text-sm text-gray-800">{ep.path}</code>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {ep.description}
                    </p>
                    {ep.params.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-gray-500">파라미터:</p>
                        <ul className="mt-1 space-y-0.5">
                          {ep.params.map((param) => (
                            <li key={param.name} className="text-xs text-gray-500">
                              <code className="text-gray-700">{param.name}</code>
                              {param.required && (
                                <span className="ml-1 text-red-500">*</span>
                              )}
                              <span className="ml-1">({param.type})</span>
                              {param.description && (
                                <span className="ml-1">- {param.description}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {ep.responseExample && Object.keys(ep.responseExample).length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-gray-500">응답 예시:</p>
                        <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-gray-50 p-2 text-xs text-gray-700">
                          {JSON.stringify(ep.responseExample, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {api.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700">태그</h3>
              <div className="mt-2 flex flex-wrap gap-1">
                {api.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 border-t border-gray-200 pt-4">
            {onSelect && (
              <button
                type="button"
                onClick={() => {
                  onSelect(api);
                  onClose();
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  isSelected
                    ? 'bg-gray-200 text-gray-600'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isSelected ? '선택됨' : '선택하기'}
              </button>
            )}
            {api.docsUrl && (
              <a
                href={api.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
