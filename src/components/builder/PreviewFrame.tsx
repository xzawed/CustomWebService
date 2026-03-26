'use client';

import { useState } from 'react';
import { Monitor, Tablet, Smartphone, RefreshCw } from 'lucide-react';

interface PreviewFrameProps {
  projectId: string;
  version?: number;
}

const DEVICES = [
  { key: 'desktop', label: '데스크톱', width: '100%', icon: Monitor },
  { key: 'tablet', label: '태블릿', width: '768px', icon: Tablet },
  { key: 'mobile', label: '모바일', width: '375px', icon: Smartphone },
] as const;

export default function PreviewFrame({ projectId, version }: PreviewFrameProps) {
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [refreshKey, setRefreshKey] = useState(0);

  const versionParam = version ? `&version=${version}` : '';
  const previewUrl = `/api/v1/preview/${projectId}?t=${refreshKey}${versionParam}`;
  const selectedDevice = DEVICES.find((d) => d.key === device)!;

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <div className="flex gap-1">
          {DEVICES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setDevice(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                device === key ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
              }`}
              title={label}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="새로고침"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      <div className="flex justify-center bg-gray-50 p-4">
        <iframe
          key={refreshKey}
          src={previewUrl}
          title="미리보기"
          style={{ width: selectedDevice.width, maxWidth: '100%' }}
          className="h-[600px] rounded-lg border border-gray-200 bg-white"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
