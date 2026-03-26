'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Monitor, Tablet, Smartphone, ArrowLeft } from 'lucide-react';

const DEVICES = [
  { id: 'desktop', label: '데스크톱', icon: Monitor, width: '100%' },
  { id: 'tablet', label: '태블릿', icon: Tablet, width: '768px' },
  { id: 'mobile', label: '모바일', icon: Smartphone, width: '375px' },
] as const;

type DeviceId = (typeof DEVICES)[number]['id'];

interface PreviewData {
  html: string;
  version: number;
  validationErrors: string[];
}

export default function PreviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [device, setDevice] = useState<DeviceId>('desktop');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPreview() {
      try {
        const res = await fetch(`/api/v1/projects/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('프로젝트를 찾을 수 없습니다.');
            return;
          }
          throw new Error('프로젝트를 불러올 수 없습니다.');
        }

        const codeRes = await fetch(`/api/v1/preview/${id}`);
        if (!codeRes.ok) {
          setError('생성된 코드가 없습니다. 먼저 빌더에서 코드를 생성해주세요.');
          return;
        }

        const data = await codeRes.json();
        setPreview(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    }
    loadPreview();
  }, [id]);

  const activeDevice = DEVICES.find((d) => d.id === device)!;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <h2 className="text-lg font-semibold text-gray-900">{error ?? '생성된 코드가 없습니다'}</h2>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          돌아가기
        </button>
      </div>
    );
  }

  const encodedHtml = `data:text/html;charset=utf-8,${encodeURIComponent(preview.html)}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/dashboard/${id}`)}
            className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">미리보기 (v{preview.version})</h1>
        </div>

        {/* Device Toggle */}
        <div className="flex rounded-lg border border-gray-200 bg-white p-1">
          {DEVICES.map(({ id: devId, label, icon: Icon }) => (
            <button
              key={devId}
              type="button"
              onClick={() => setDevice(devId)}
              title={label}
              className={`rounded-md p-2 transition-colors ${
                device === devId ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {/* Preview Frame */}
      <div className="flex justify-center rounded-xl border border-gray-200 bg-gray-100 p-4">
        <div
          className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm transition-all duration-300"
          style={{ width: activeDevice.width, maxWidth: '100%' }}
        >
          <iframe
            src={encodedHtml}
            title="서비스 미리보기"
            className="h-[75vh] w-full"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>

      {/* Validation Warnings */}
      {preview.validationErrors.length > 0 && (
        <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <h3 className="text-sm font-medium text-yellow-800">검증 경고</h3>
          <ul className="mt-2 list-inside list-disc text-xs text-yellow-700">
            {preview.validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
