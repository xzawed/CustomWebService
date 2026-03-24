'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePublish } from '@/hooks/usePublish';
import type { Project } from '@/types/project';

interface ProjectPublishActionsProps {
  project: Project;
}

function buildPublishUrl(slug: string): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (!rootDomain) return `/site/${slug}`;
  const isLocalhost = rootDomain.includes('localhost') || rootDomain.includes('127.0.0.1');
  if (isLocalhost) return `/site/${slug}`;
  return `https://${slug}.${rootDomain}`;
}

export function ProjectPublishActions({ project }: ProjectPublishActionsProps) {
  const router = useRouter();
  const { publish, unpublish, isLoading, error } = usePublish();
  const [copied, setCopied] = useState(false);

  const publishUrl = project.slug ? buildPublishUrl(project.slug) : null;
  const canPublish = ['generated', 'deployed', 'unpublished'].includes(project.status);
  const isPublished = project.status === 'published';

  const handlePublish = async () => {
    try {
      await publish(project.id);
      router.refresh();
    } catch {
      // 에러는 usePublish에서 처리
    }
  };

  const handleUnpublish = async () => {
    try {
      await unpublish(project.id);
      router.refresh();
    } catch {
      // 에러는 usePublish에서 처리
    }
  };

  const handleCopy = () => {
    if (!publishUrl) return;
    const fullUrl = publishUrl.startsWith('http')
      ? publishUrl
      : `${window.location.origin}${publishUrl}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold text-gray-700">게시 설정</h2>

      {isPublished && publishUrl && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3">
          <a
            href={publishUrl.startsWith('http') ? publishUrl : `${typeof window !== 'undefined' ? window.location.origin : ''}${publishUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm font-medium text-emerald-700 hover:underline"
          >
            {publishUrl}
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200"
          >
            {copied ? '복사됨!' : 'URL 복사'}
          </button>
        </div>
      )}

      {error && (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-2">
        {canPublish && (
          <button
            type="button"
            onClick={handlePublish}
            disabled={isLoading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isLoading ? '처리 중...' : '게시하기'}
          </button>
        )}
        {isPublished && (
          <button
            type="button"
            onClick={handleUnpublish}
            disabled={isLoading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isLoading ? '처리 중...' : '게시 취소'}
          </button>
        )}
      </div>
    </div>
  );
}
