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

interface ProjectCardProps {
  project: Project;
  onDelete?: (id: string) => void;
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const status = statusConfig[project.status];

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

      {project.deployUrl && isValidUrl(project.deployUrl) && (
        <a
          href={project.deployUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block truncate text-sm text-blue-600 hover:underline"
        >
          {project.deployUrl}
        </a>
      )}

      <p className="mt-3 text-xs text-gray-400">
        {formatDate(project.createdAt)} 생성
      </p>

      <div className="mt-4 flex gap-2">
        <Link
          href={`/dashboard/${project.id}`}
          className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
        >
          상세 보기
        </Link>
        {(project.status === 'generated' || project.status === 'deployed') && (
          <Link
            href={`/preview/${project.id}`}
            className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            미리보기
          </Link>
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
