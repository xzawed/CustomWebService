'use client';

import React, { useState, useCallback, useTransition } from 'react';
import { GalleryCard } from '@/components/gallery/GalleryCard';
import { GalleryFilters } from '@/components/gallery/GalleryFilters';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { GalleryItem, GalleryFilter, GalleryPage } from '@/types/gallery';

interface GalleryClientProps {
  initialData: GalleryPage;
  currentUserId?: string;
}

async function fetchGallery(
  filter: GalleryFilter,
  page: number,
  pageSize: number
): Promise<GalleryPage> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  if (filter.sortBy) params.set('sortBy', filter.sortBy);
  if (filter.search) params.set('search', filter.search);
  if (filter.category) params.set('category', filter.category);

  const res = await fetch(`/api/v1/gallery?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('갤러리를 불러오지 못했습니다.');
  const json = (await res.json()) as { success: boolean; data: GalleryPage };
  return json.data;
}

async function toggleLikeApi(
  projectId: string,
  currentlyLiked: boolean
): Promise<{ liked: boolean; likesCount: number }> {
  const method = currentlyLiked ? 'DELETE' : 'POST';
  const res = await fetch(`/api/v1/gallery/${projectId}/like`, {
    method,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('좋아요 처리 중 오류가 발생했습니다.');
  const json = (await res.json()) as { success: boolean; data: { liked: boolean; likesCount: number } };
  return json.data;
}

async function forkProjectApi(projectId: string): Promise<{ projectId: string; slug: string }> {
  const res = await fetch(`/api/v1/gallery/${projectId}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('포크 처리 중 오류가 발생했습니다.');
  const json = (await res.json()) as { success: boolean; data: { projectId: string; slug: string } };
  return json.data;
}

const PAGE_SIZE = 12;

export function GalleryClient({ initialData, currentUserId }: GalleryClientProps): React.ReactElement {
  const [filter, setFilter] = useState<GalleryFilter>({ sortBy: 'newest' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<GalleryPage>(initialData);
  const [items, setItems] = useState<GalleryItem[]>(initialData.items);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.ceil(data.total / PAGE_SIZE);

  const loadGallery = useCallback(
    (newFilter: GalleryFilter, newPage: number) => {
      setError(null);
      startTransition(async () => {
        try {
          const result = await fetchGallery(newFilter, newPage, PAGE_SIZE);
          setData(result);
          setItems(result.items);
        } catch (err) {
          setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
        }
      });
    },
    []
  );

  function handleFilterChange(newFilter: GalleryFilter): void {
    setFilter(newFilter);
    setPage(1);
    loadGallery(newFilter, 1);
  }

  function handlePageChange(newPage: number): void {
    setPage(newPage);
    loadGallery(filter, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleLike(id: string): void {
    if (!currentUserId) return;
    const target = items.find((item) => item.id === id);
    if (!target) return;
    const wasLiked = target.isLikedByCurrentUser;

    // Optimistic update
    setItems((prev) =>
      prev.map((item) =>
        item.id !== id
          ? item
          : {
              ...item,
              isLikedByCurrentUser: !wasLiked,
              likesCount: wasLiked ? item.likesCount - 1 : item.likesCount + 1,
            }
      )
    );

    toggleLikeApi(id, wasLiked)
      .then((result) => {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, isLikedByCurrentUser: result.liked, likesCount: result.likesCount }
              : item
          )
        );
      })
      .catch(() => {
        // Revert optimistic update on error
        setItems((prev) =>
          prev.map((item) =>
            item.id !== id
              ? item
              : {
                  ...item,
                  isLikedByCurrentUser: wasLiked,
                  likesCount: wasLiked ? item.likesCount + 1 : item.likesCount - 1,
                }
          )
        );
      });
  }

  function handleFork(id: string): void {
    if (!currentUserId) return;
    forkProjectApi(id)
      .then((result) => {
        window.location.href = `/dashboard/${result.projectId}`;
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '포크 중 오류가 발생했습니다.');
      });
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-8">
        <GalleryFilters filter={filter} onChange={handleFilterChange} />
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-6 rounded-xl p-4 text-sm"
          style={{ background: 'rgba(225,29,72,0.08)', color: '#e11d48', border: '1px solid rgba(225,29,72,0.2)' }}
        >
          {error}
        </div>
      )}

      {/* Loading overlay */}
      {isPending && (
        <div className="mb-6 flex items-center justify-center gap-2 py-4" style={{ color: 'var(--text-muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">불러오는 중...</span>
        </div>
      )}

      {/* Grid */}
      {!isPending && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-surface)' }}
          >
            <span className="text-2xl">🌐</span>
          </div>
          <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
            아직 공개된 서비스가 없습니다
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            첫 번째 서비스를 만들고 갤러리에 공유해보세요!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <GalleryCard
              key={item.id}
              item={item}
              currentUserId={currentUserId}
              onLike={currentUserId ? handleLike : undefined}
              onFork={currentUserId ? handleFork : undefined}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={page <= 1 || isPending}
            onClick={() => handlePageChange(page - 1)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:opacity-40"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <ChevronLeft className="h-4 w-4" />
            이전
          </button>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || isPending}
            onClick={() => handlePageChange(page + 1)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:opacity-40"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            다음
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
