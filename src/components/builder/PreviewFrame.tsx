'use client';

import { useState, useRef } from 'react';
import { Monitor, Tablet, Smartphone, RefreshCw } from 'lucide-react';

interface PreviewFrameProps {
  projectId: string;
  version?: number;
}

const DEVICES = [
  { key: 'desktop', label: '데스크톱', width: '100%', icon: Monitor },
  { key: 'tablet', label: '태블릿', width: 'min(768px, 100%)', icon: Tablet },
  { key: 'mobile', label: '모바일', width: 'min(375px, 100%)', icon: Smartphone },
] as const;

export default function PreviewFrame({ projectId, version }: PreviewFrameProps) {
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [cacheBust, setCacheBust] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const versionParam = version ? `&version=${version}` : '';
  const previewUrl = `/api/v1/preview/${projectId}?t=${cacheBust}${versionParam}`;
  const selectedDevice = DEVICES.find((d) => d.key === device)!;

  function handleRefresh() {
    // src 변경으로 브라우저가 iframe을 자연스럽게 리로드 — DOM 재마운트 없음
    setCacheBust((k) => k + 1);
  }

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
    >
      {/* 툴바 */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex gap-1">
          {DEVICES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setDevice(key)}
              title={label}
              className="rounded-lg p-2 transition-all"
              style={{
                background: device === key ? 'rgba(0,212,255,0.12)' : 'transparent',
                color: device === key ? 'var(--accent-cyan)' : 'var(--text-muted)',
              }}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        {/* URL 표시 */}
        <div
          className="hidden flex-1 mx-4 rounded-lg px-3 py-1.5 text-xs sm:block"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}
        >
          미리보기 — {selectedDevice.label}
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          title="새로고침"
          className="rounded-lg p-2 transition-all"
          style={{ color: 'var(--text-muted)' }}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* iframe */}
      <div
        className="flex justify-center p-4"
        style={{ background: 'var(--bg-surface)' }}
      >
        <iframe
          ref={iframeRef}
          src={previewUrl}
          title="미리보기"
          style={{
            width: selectedDevice.width,
            maxWidth: '100%',
            height: '640px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: '#fff',
          }}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
