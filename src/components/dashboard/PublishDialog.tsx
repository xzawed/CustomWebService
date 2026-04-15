'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { usePublish } from '@/hooks/usePublish';
import type { Project } from '@/types/project';

interface PublishDialogProps {
  project: Project;
  onClose: () => void;
  onPublished: () => void;
}

type CheckResult = 'idle' | 'checking' | 'available' | 'invalid' | 'reserved' | 'taken';
type SelectedMode = 'suggestion' | 'custom';

export function PublishDialog({ project, onClose, onPublished }: PublishDialogProps) {
  const hasSuggestions = (project.suggestedSlugs?.length ?? 0) > 0;
  const suggestions = project.suggestedSlugs ?? [];

  const [selectedMode, setSelectedMode] = useState<SelectedMode>(
    hasSuggestions ? 'suggestion' : 'custom',
  );
  const [selectedSuggestion, setSelectedSuggestion] = useState<string>(suggestions[0] ?? '');
  const [customValue, setCustomValue] = useState('');
  const [checkResult, setCheckResult] = useState<CheckResult>('idle');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const { publish } = usePublish();

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus first radio or input on open
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  // ESC key closes dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    const container = dialogRef.current;
    if (!container) return;

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handleFocusTrap);
    return () => container.removeEventListener('keydown', handleFocusTrap);
  }, []);

  // Debounced slug check
  const checkSlug = useCallback(
    (value: string) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (!value.trim()) {
        setCheckResult('idle');
        return;
      }
      setCheckResult('checking');
      const controller = new AbortController();
      abortControllerRef.current = controller;
      debounceTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/v1/projects/${project.id}/slug/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: value }),
            signal: controller.signal,
          });
          const data = (await res.json()) as {
            data?: { available: boolean; reason?: string };
          };
          if (data.data?.available === true) {
            setCheckResult('available');
          } else {
            const reason = data.data?.reason;
            if (reason === 'invalid' || reason === 'reserved' || reason === 'taken') {
              setCheckResult(reason);
            } else {
              setCheckResult('taken');
            }
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            return;
          }
          setCheckResult('idle');
        }
      }, 300);
    },
    [project.id],
  );

  useEffect(() => {
    if (selectedMode !== 'custom') {
      setCheckResult('idle');
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }
    checkSlug(customValue);
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [customValue, selectedMode, checkSlug]);

  const isPublishDisabled =
    isPublishing ||
    (selectedMode === 'custom' && checkResult !== 'available') ||
    (selectedMode === 'suggestion' && !selectedSuggestion);

  const handlePublish = async () => {
    setIsPublishing(true);
    setPublishError(null);
    try {
      const slug =
        selectedMode === 'suggestion'
          ? selectedSuggestion
          : customValue;
      await publish(project.id, slug);
      onPublished();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : '게시에 실패했습니다.';
      setPublishError(message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDefaultPublish = async () => {
    setIsPublishing(true);
    setPublishError(null);
    try {
      await publish(project.id);
      onPublished();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : '게시에 실패했습니다.';
      setPublishError(message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const checkResultMessage = () => {
    switch (checkResult) {
      case 'checking':
        return <span style={{ color: 'var(--text-muted)' }}>확인 중...</span>;
      case 'available':
        return (
          <span className="flex items-center gap-1" style={{ color: 'var(--success, #16a34a)' }}>
            <Check className="h-3.5 w-3.5" />
            사용 가능
          </span>
        );
      case 'invalid':
        return (
          <span className="flex items-center gap-1" style={{ color: 'var(--error, #dc2626)' }}>
            <AlertCircle className="h-3.5 w-3.5" />
            유효하지 않은 형식입니다
          </span>
        );
      case 'reserved':
        return (
          <span className="flex items-center gap-1" style={{ color: 'var(--error, #dc2626)' }}>
            <AlertCircle className="h-3.5 w-3.5" />
            예약된 주소입니다
          </span>
        );
      case 'taken':
        return (
          <span className="flex items-center gap-1" style={{ color: 'var(--error, #dc2626)' }}>
            <AlertCircle className="h-3.5 w-3.5" />
            이미 사용 중입니다
          </span>
        );
      default:
        return null;
    }
  };

  const rootDomain =
    typeof window !== 'undefined'
      ? window.location.hostname.replace(/^[^.]+\./, '')
      : 'xzawed.xyz';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-labelledby="publish-dialog-title"
        aria-modal="true"
        className="relative w-full max-w-md rounded-xl p-6 shadow-lg"
        style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="publish-dialog-title"
            className="text-base font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            서비스 게시
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-lg p-1 transition-colors hover:bg-gray-100"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          웹사이트 주소를 선택하세요:
        </p>

        <div className="space-y-3">
          {/* Suggestion radios */}
          {hasSuggestions &&
            suggestions.map((slug, i) => (
              <label
                key={slug}
                className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors"
                style={{
                  border:
                    selectedMode === 'suggestion' && selectedSuggestion === slug
                      ? '1px solid var(--accent-primary)'
                      : '1px solid var(--border)',
                  background:
                    selectedMode === 'suggestion' && selectedSuggestion === slug
                      ? 'var(--accent-light)'
                      : 'transparent',
                }}
              >
                <input
                  ref={i === 0 ? firstInputRef : undefined}
                  type="radio"
                  name="slug-mode"
                  value={slug}
                  checked={selectedMode === 'suggestion' && selectedSuggestion === slug}
                  onChange={() => {
                    setSelectedMode('suggestion');
                    setSelectedSuggestion(slug);
                  }}
                  className="mt-0.5 shrink-0"
                />
                <div>
                  <span
                    className="block text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {slug}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {slug}.{rootDomain}
                  </span>
                </div>
              </label>
            ))}

          {/* Custom input radio / direct input */}
          <label
            className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors"
            style={{
              border:
                selectedMode === 'custom' || !hasSuggestions
                  ? '1px solid var(--accent-primary)'
                  : '1px solid var(--border)',
              background:
                selectedMode === 'custom' || !hasSuggestions ? 'var(--accent-light)' : 'transparent',
            }}
          >
            {hasSuggestions && (
              <input
                type="radio"
                name="slug-mode"
                value="custom"
                checked={selectedMode === 'custom'}
                onChange={() => setSelectedMode('custom')}
                className="mt-0.5 shrink-0"
              />
            )}
            <div className="flex-1">
              {hasSuggestions ? (
                <span
                  className="mb-1.5 block text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  직접 입력:
                </span>
              ) : (
                <span
                  className="mb-1.5 block text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  직접 입력해 주세요
                </span>
              )}
              <input
                ref={!hasSuggestions ? firstInputRef : undefined}
                type="text"
                value={customValue}
                onChange={(e) => {
                  setCustomValue(e.target.value);
                  if (hasSuggestions) {
                    setSelectedMode('custom');
                  }
                }}
                onFocus={() => {
                  if (hasSuggestions) {
                    setSelectedMode('custom');
                  }
                }}
                placeholder="my-service"
                className="w-full rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2"
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface, #f9fafb)',
                  color: 'var(--text-primary)',
                }}
              />
              {selectedMode === 'custom' && customValue && (
                <div className="mt-1 text-xs">{checkResultMessage()}</div>
              )}
            </div>
          </label>
        </div>

        {/* Error */}
        {publishError && (
          <p className="mt-3 text-sm text-red-600">{publishError}</p>
        )}

        {/* Footer buttons */}
        <div className="mt-6 flex items-center justify-between gap-3">
          {!hasSuggestions && (
            <button
              type="button"
              onClick={handleDefaultPublish}
              disabled={isPublishing}
              className="text-sm underline disabled:opacity-50"
              style={{ color: 'var(--text-muted)' }}
            >
              기본 주소로 게시
            </button>
          )}
          <div className={`flex gap-2 ${!hasSuggestions ? '' : 'ml-auto'}`}>
            <button
              type="button"
              onClick={onClose}
              disabled={isPublishing}
              className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={isPublishDisabled}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent-primary, #10b981)' }}
            >
              {isPublishing ? '게시 중...' : '게시하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
