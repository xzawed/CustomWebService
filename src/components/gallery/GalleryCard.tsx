'use client';

import Link from 'next/link';
import { Heart, GitFork, ExternalLink } from 'lucide-react';
import type { GalleryItem } from '@/types/gallery';

interface GalleryCardProps {
  item: GalleryItem;
  currentUserId?: string;
  onLike?: (id: string) => void;
  onFork?: (id: string) => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function GalleryCard({ item, currentUserId, onLike, onFork }: GalleryCardProps): React.ReactElement {
  const isAuthenticated = !!currentUserId;
  const canLike = isAuthenticated && !!onLike;
  const canFork = isAuthenticated && !!onFork;

  return (
    <div
      className="card flex flex-col p-5 transition-shadow hover:shadow-lg"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3
          className="truncate text-sm font-bold leading-snug"
          style={{ color: 'var(--text-primary)' }}
        >
          {item.name}
        </h3>
        {item.category && (
          <span
            className="badge shrink-0 text-xs"
            style={{
              background: 'rgba(99,102,241,0.12)',
              color: 'var(--accent-primary)',
            }}
          >
            {item.category}
          </span>
        )}
      </div>

      {/* Description */}
      {item.description && (
        <p
          className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {item.description}
        </p>
      )}

      {/* Owner + Date */}
      <div className="mt-3 flex items-center justify-between gap-2">
        {item.ownerName && (
          <span className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {item.ownerName}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {formatDate(item.createdAt)}
        </span>
      </div>

      {/* Footer: likes + actions */}
      <div className="mt-4 flex items-center gap-2">
        {/* Like button */}
        <button
          type="button"
          disabled={!canLike}
          onClick={canLike ? () => onLike(item.id) : undefined}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all disabled:cursor-default"
          style={{
            color: item.isLikedByCurrentUser ? '#e11d48' : 'var(--text-muted)',
            background: item.isLikedByCurrentUser
              ? 'rgba(225,29,72,0.1)'
              : 'var(--bg-surface)',
            border: '1px solid',
            borderColor: item.isLikedByCurrentUser
              ? 'rgba(225,29,72,0.25)'
              : 'var(--border)',
          }}
          title={canLike ? (item.isLikedByCurrentUser ? '좋아요 취소' : '좋아요') : undefined}
        >
          <Heart
            className="h-3 w-3"
            style={{ fill: item.isLikedByCurrentUser ? 'currentColor' : 'none' }}
          />
          <span>{item.likesCount}</span>
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Fork button (authenticated only) */}
        {canFork && (
          <button
            type="button"
            onClick={() => onFork(item.id)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all"
            style={{
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--ghost-hover-bg)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <GitFork className="h-3 w-3" />
            포크하기
          </button>
        )}

        {/* View link */}
        <Link
          href={`/preview/${item.id}`}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all"
          style={{
            color: 'var(--accent-primary)',
            border: '1px solid rgba(99,102,241,0.25)',
            background: 'rgba(99,102,241,0.06)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(99,102,241,0.15)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(99,102,241,0.06)';
          }}
        >
          <ExternalLink className="h-3 w-3" />
          보기
        </Link>
      </div>
    </div>
  );
}
