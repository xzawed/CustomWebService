'use client';

import Link from 'next/link';
import type { Project, ProjectStatus } from '@/types/project';
import { Eye, ExternalLink, Trash2, Globe, GlobeLock, Copy, Check } from 'lucide-react';
import { useState } from 'react';

const statusConfig: Record<ProjectStatus, { label: string; dotClass: string; style: { background: string; color: string } }> = {
  draft:       { label: '초안',    dotClass: 'bg-slate-400',             style: { background: 'rgba(100,116,139,0.12)', color: '#64748b' } },
  generating:  { label: '생성 중', dotClass: 'bg-amber-400 animate-pulse',style: { background: 'rgba(245,158,11,0.12)',  color: '#d97706' } },
  generated:   { label: '생성 완료',dotClass: 'bg-blue-400',              style: { background: 'rgba(59,130,246,0.12)',  color: '#2563eb' } },
  deploying:   { label: '배포 중', dotClass: 'bg-purple-400 animate-pulse',style: { background: 'rgba(139,92,246,0.12)', color: '#7c3aed' } },
  deployed:    { label: '배포됨',  dotClass: 'bg-emerald-400',           style: { background: 'rgba(16,185,129,0.12)', color: '#059669' } },
  published:   { label: '게시됨',  dotClass: 'bg-emerald-400',           style: { background: 'rgba(16,185,129,0.12)', color: '#059669' } },
  unpublished: { label: '게시 취소',dotClass: 'bg-slate-400',             style: { background: 'rgba(100,116,139,0.12)', color: '#64748b' } },
  failed:      { label: '실패',    dotClass: 'bg-rose-400',              style: { background: 'rgba(244,63,94,0.12)',   color: '#e11d48' } },
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
        <h3 className="truncate text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{project.name}</h3>
        <span className="badge shrink-0 gap-1.5" style={status.style}>
          <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
          {status.label}
        </span>
      </div>

      {/* Description */}
      {project.context && (
        <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {project.context}
        </p>
      )}

      {/* Published URL */}
      {project.status === 'published' && publishUrl && (
        <div
          className="mt-3 flex items-center gap-1.5 rounded-lg p-2"
          style={{ background: 'var(--bg-surface)' }}
        >
          <Globe className="h-3 w-3 shrink-0" style={{ color: '#059669' }} />
          <a
            href={
              publishUrl.startsWith('http')
                ? publishUrl
                : `${typeof window !== 'undefined' ? window.location.origin : ''}${publishUrl}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs hover:underline"
            style={{ color: '#059669' }}
          >
            {publishUrl}
          </a>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="shrink-0 rounded p-1 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="URL 복사"
          >
            {copied ? <Check className="h-3 w-3" style={{ color: '#059669' }} /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      )}

      {/* Date */}
      <p className="mt-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>{formatDate(project.createdAt)}</p>

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
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
            style={{ color: '#059669', border: '1px solid rgba(16,185,129,0.25)', background: 'transparent' }}
          >
            <Globe className="h-3 w-3" />
            게시
          </button>
        )}
        {onUnpublish && project.status === 'published' && (
          <button
            type="button"
            onClick={() => onUnpublish(project.id)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)', background: 'transparent' }}
          >
            <GlobeLock className="h-3 w-3" />
            게시 취소
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(project.id)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
            style={{ color: '#e11d48', border: '1px solid rgba(225,29,72,0.2)', background: 'transparent' }}
          >
            <Trash2 className="h-3 w-3" />
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
