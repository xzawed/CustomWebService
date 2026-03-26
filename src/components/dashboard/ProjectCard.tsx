'use client';

import Link from 'next/link';
import type { Project, ProjectStatus } from '@/types/project';
import { Eye, ExternalLink, Trash2, Globe, GlobeLock, Copy, Check } from 'lucide-react';
import { useState } from 'react';

const statusConfig: Record<ProjectStatus, { label: string; dot: string; bg: string }> = {
  draft: { label: '초안', dot: 'bg-slate-400', bg: 'bg-slate-500/10 text-slate-300' },
  generating: {
    label: '생성 중',
    dot: 'bg-amber-400 animate-pulse',
    bg: 'bg-amber-500/10 text-amber-400',
  },
  generated: { label: '생성 완료', dot: 'bg-blue-400', bg: 'bg-blue-500/10 text-blue-400' },
  deploying: {
    label: '배포 중',
    dot: 'bg-purple-400 animate-pulse',
    bg: 'bg-purple-500/10 text-purple-400',
  },
  deployed: { label: '배포됨', dot: 'bg-emerald-400', bg: 'bg-emerald-500/10 text-emerald-400' },
  published: { label: '게시됨', dot: 'bg-emerald-400', bg: 'bg-emerald-500/10 text-emerald-400' },
  unpublished: { label: '게시 취소', dot: 'bg-slate-400', bg: 'bg-slate-500/10 text-slate-400' },
  failed: { label: '실패', dot: 'bg-rose-400', bg: 'bg-rose-500/10 text-rose-400' },
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
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = () => {
    if (!publishUrl) return;
    const fullUrl = publishUrl.startsWith('http')
      ? publishUrl
      : `${window.location.origin}${publishUrl}`;
    navigator.clipboard
      .writeText(fullUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="card p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-bold text-white">{project.name}</h3>
        <span className={`badge shrink-0 gap-1.5 ${status.bg}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      {/* Description */}
      {project.context && (
        <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-slate-400">
          {project.context}
        </p>
      )}

      {/* Published URL */}
      {project.status === 'published' && publishUrl && (
        <div
          className="mt-3 flex items-center gap-1.5 rounded-lg p-2"
          style={{ background: 'var(--bg-surface)' }}
        >
          <Globe className="h-3 w-3 shrink-0 text-emerald-400" />
          <a
            href={
              publishUrl.startsWith('http')
                ? publishUrl
                : `${typeof window !== 'undefined' ? window.location.origin : ''}${publishUrl}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs text-emerald-400 hover:underline"
          >
            {publishUrl}
          </a>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:text-white"
            title="URL 복사"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      )}

      {/* Date */}
      <p className="mt-3 text-[11px] text-slate-500">{formatDate(project.createdAt)}</p>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/dashboard/${project.id}`}
          className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
        >
          <Eye className="h-3 w-3" />
          상세
        </Link>
        {PREVIEWABLE_STATUSES.includes(project.status) && (
          <Link
            href={`/preview/${project.id}`}
            className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <ExternalLink className="h-3 w-3" />
            미리보기
          </Link>
        )}
        {onPublish && PUBLISHABLE_STATUSES.includes(project.status) && (
          <button
            type="button"
            onClick={() => onPublish(project.id)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-400 transition-all hover:bg-emerald-500/10"
            style={{ border: '1px solid rgba(16, 185, 129, 0.2)' }}
          >
            <Globe className="h-3 w-3" />
            게시
          </button>
        )}
        {onUnpublish && project.status === 'published' && (
          <button
            type="button"
            onClick={() => onUnpublish(project.id)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 transition-all hover:bg-white/[0.04]"
            style={{ border: '1px solid var(--border)' }}
          >
            <GlobeLock className="h-3 w-3" />
            게시 취소
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(project.id)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-rose-400 transition-all hover:bg-rose-500/10"
            style={{ border: '1px solid rgba(244, 63, 94, 0.2)' }}
          >
            <Trash2 className="h-3 w-3" />
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
