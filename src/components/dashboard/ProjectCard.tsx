'use client';

import Link from 'next/link';
import type { Project, ProjectStatus } from '@/types/project';

const statusConfig: Record<ProjectStatus, { label: string; className: string }> = {
  draft: { label: '초안', className: 'bg-gray-100 text-gray-700' },
  generating: { label: '생성 중', className: 'bg-yellow-100 text-yellow-700' },
  generated: { label: '생성 완료', className: 'bg-blue-100 text-blue-700' },
  deploying: { label: '배포 중', className: 'bg-purple-100 text-purple-700' },
  deployed: { label: '배포됨', className: 'bg-green-100 text-green-700' },
  published: { label: '게시됨', className: 'bg-emerald-100 text-emerald-700' },
  unpublished: { label: '게시 취소', className: 'bg-gray-100 text-gray-500' },
  failed: { label: '실패', className: 'bg-red-100 text-red-700' },
};

const PUBLISHABLE_STATUSES: ProjectStatus[] = ['generated', 'deployed', 'unpublished'];
const PREVIEWABLE_STATUSES: ProjectStatus[] = ['generated', 'deployed', 'published', 'unpublished'];

interface ProjectCardProps {
  project: Project;
  onDelete?: (id: string) => void;
  onPublish?: (id: string) => void;
  onUnpublish?: (id: string) => void;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function buildPublishUrl(slug: string): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (!rootDomain) return `/site/${slug}`;
  const isLocalhost = rootDomain.includes('localhost') || rootDomain.includes('127.0.0.1');
  if (isLocalhost) return `/site/${slug}`;
  return `https://${slug}.${rootDomain}`;
}

export function ProjectCard({ project, onDelete, onPublish, onUnpublish }: ProjectCardProps) {
  const status = statusConfig[project.status];
  const publishUrl = project.slug ? buildPublishUrl(project.slug) : null;

  const handleCopyUrl = () => {
    if (!publishUrl) return;
    const fullUrl = publishUrl.startsWith('http')
      ? publishUrl
      : `${window.location.origin}${publishUrl}`;
    navigator.clipboard.writeText(fullUrl).catch(() => {});
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <h3 className="truncate text-base font-semibold text-gray-900">
          {project.name}
        </h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      {project.context && (
        <p className="mt-2 line-clamp-2 text-sm text-gray-500">
          {project.context}
        </p>
      )}

      {project.status === 'published' && publishUrl && (
        <div className="mt-2 flex items-center gap-1">
          <a
            href={publishUrl.startsWith('http') ? publishUrl : `${typeof window !== 'undefined' ? window.location.origin : ''}${publishUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm text-emerald-600 hover:underline"
          >
            {publishUrl}
          </a>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="URL 복사"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        {formatDate(project.createdAt)} 생성
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/dashboard/${project.id}`}
          className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
        >
          상세 보기
        </Link>
        {PREVIEWABLE_STATUSES.includes(project.status) && (
          <Link
            href={`/preview/${project.id}`}
            className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            미리보기
          </Link>
        )}
        {onPublish && PUBLISHABLE_STATUSES.includes(project.status) && (
          <button
            type="button"
            onClick={() => onPublish(project.id)}
            className="rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
          >
            게시
          </button>
        )}
        {onUnpublish && project.status === 'published' && (
          <button
            type="button"
            onClick={() => onUnpublish(project.id)}
            className="rounded-md bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            게시 취소
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(project.id)}
            className="rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
