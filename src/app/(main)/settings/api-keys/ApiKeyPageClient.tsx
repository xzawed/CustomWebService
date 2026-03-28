'use client';

import { useState } from 'react';
import { Key } from 'lucide-react';
import { ApiKeyCard } from '@/components/settings/ApiKeyCard';
import type { ApiCatalogItem } from '@/types/api';
import { maskApiKey, decryptApiKey } from '@/lib/encryption';

interface ServerKey {
  apiId: string;
  encryptedKey: string;
  isVerified: boolean;
}

interface SavedKey {
  apiId: string;
  maskedKey: string;
  isVerified: boolean;
}

interface Props {
  apis: ApiCatalogItem[];
  initialSavedKeys: ServerKey[];
}

function toMasked(serverKey: ServerKey): SavedKey {
  let maskedKey = '****';
  try {
    maskedKey = maskApiKey(decryptApiKey(serverKey.encryptedKey));
  } catch {
    // 복호화 실패 시 기본값
  }
  return { apiId: serverKey.apiId, maskedKey, isVerified: serverKey.isVerified };
}

export function ApiKeyPageClient({ apis, initialSavedKeys }: Props) {
  const [savedKeys, setSavedKeys] = useState<SavedKey[]>(initialSavedKeys.map(toMasked));

  async function handleSave(apiId: string, key: string) {
    const res = await fetch('/api/v1/user-api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiId, apiKey: key }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? '저장 실패');
    }
    setSavedKeys((prev) => {
      const next = prev.filter((k) => k.apiId !== apiId);
      next.push({
        apiId,
        maskedKey: key.slice(0, 4) + '*'.repeat(Math.min(key.length - 4, 20)),
        isVerified: false,
      });
      return next;
    });
  }

  async function handleDelete(apiId: string) {
    const res = await fetch(`/api/v1/user-api-keys?apiId=${apiId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('삭제 실패');
    setSavedKeys((prev) => prev.filter((k) => k.apiId !== apiId));
  }

  const registeredCount = savedKeys.length;
  const totalCount = apis.length;

  return (
    <div>
      {/* 진행 현황 */}
      <div
        className="mb-6 flex items-center gap-4 rounded-2xl p-4"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'rgba(6,182,212,0.15)' }}
        >
          <Key className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">
            {registeredCount} / {totalCount}개 등록됨
          </p>
          <p className="text-xs text-slate-400">
            등록된 API만 생성된 서비스에서 실제 데이터를 표시해요
          </p>
        </div>
        <div className="ml-auto text-right">
          <div className="h-2 w-24 overflow-hidden rounded-full" style={{ background: 'var(--bg-surface)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${totalCount ? (registeredCount / totalCount) * 100 : 0}%`,
                background: 'linear-gradient(90deg, #06b6d4, #8b5cf6)',
              }}
            />
          </div>
        </div>
      </div>

      {/* API 카드 목록 */}
      {apis.length === 0 ? (
        <p className="text-center text-slate-400 py-10">등록 가능한 API가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {apis.map((api) => (
            <ApiKeyCard
              key={api.id}
              api={api}
              savedKey={savedKeys.find((k) => k.apiId === api.id)}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-slate-500">
        API 키는 암호화되어 안전하게 저장됩니다. 저장된 키는 생성된 서비스에서만 사용되며 외부에 공개되지 않습니다.
      </p>
    </div>
  );
}
