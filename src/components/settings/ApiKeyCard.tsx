'use client';

import { useState } from 'react';
import { CheckCircle2, HelpCircle, Trash2, Eye, EyeOff, Save, Loader2 } from 'lucide-react';
import { ApiKeyGuideModal } from './ApiKeyGuideModal';
import { getApiKeyGuide, getDefaultGuide } from '@/lib/apiKeyGuides';
import type { ApiCatalogItem } from '@/types/api';

interface SavedKey {
  apiId: string;
  maskedKey: string;
  isVerified: boolean;
}

interface Props {
  api: ApiCatalogItem;
  savedKey: SavedKey | undefined;
  onSave: (apiId: string, key: string) => Promise<void>;
  onDelete: (apiId: string) => Promise<void>;
}

export function ApiKeyCard({ api, savedKey, onSave, onDelete }: Props) {
  const [showGuide, setShowGuide] = useState(false);
  const [inputKey, setInputKey] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const guide = getApiKeyGuide(api.name) ?? getDefaultGuide(api.docsUrl);
  const hasKey = !!savedKey;

  async function handleSave() {
    if (!inputKey.trim()) { setError('키를 입력해 주세요.'); return; }
    setError('');
    setSaving(true);
    try {
      await onSave(api.id, inputKey.trim());
      setInputKey('');
      setShowInput(false);
    } catch {
      setError('저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`"${api.name}" API 키를 삭제할까요?`)) return;
    setDeleting(true);
    try {
      await onDelete(api.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        className="glass rounded-2xl p-5 transition-all"
        style={{ background: 'var(--bg-card)', border: `1px solid ${hasKey ? 'rgba(16,185,129,0.3)' : 'var(--border)'}` }}
      >
        {/* 상단: API 이름 + 상태 */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">{api.name}</h3>
              {hasKey && (
                <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-emerald-400"
                  style={{ background: 'rgba(16,185,129,0.1)' }}>
                  <CheckCircle2 className="h-3 w-3" />
                  등록됨
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-400 line-clamp-2">{api.description}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="shrink-0 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-cyan-400 transition-colors hover:bg-white/10"
            aria-label="발급 방법 보기"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            발급 방법
          </button>
        </div>

        {/* 등록된 키 표시 */}
        {hasKey && !showInput && (
          <div className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <span className="flex-1 font-mono text-sm text-slate-300">{savedKey.maskedKey}</span>
            <button
              type="button"
              onClick={() => setShowInput(true)}
              className="text-xs text-cyan-400 hover:text-cyan-300"
            >
              변경
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-slate-500 hover:text-red-400 transition-colors"
              aria-label="키 삭제"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>
        )}

        {/* 키 입력 폼 */}
        {(!hasKey || showInput) && (
          <div className="space-y-2">
            <div className="relative flex items-center">
              <input
                type="text"
                value={inputKey}
                onChange={(e) => { setInputKey(e.target.value); setError(''); }}
                placeholder="API 키를 여기에 붙여넣으세요"
                className="w-full rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-slate-500 outline-none transition-all focus:ring-2 focus:ring-cyan-500/50"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex flex-1 items-center justify-center gap-2 py-2.5 text-sm"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                저장하기
              </button>
              {showInput && (
                <button
                  type="button"
                  onClick={() => { setShowInput(false); setInputKey(''); setError(''); }}
                  className="rounded-xl px-4 py-2.5 text-sm text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                >
                  취소
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showGuide && (
        <ApiKeyGuideModal
          apiName={api.name}
          guide={guide}
          onClose={() => setShowGuide(false)}
        />
      )}
    </>
  );
}
