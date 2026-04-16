'use client';

import { useState, useCallback } from 'react';
import { Sparkles, Wand2, Loader2, ChevronDown, ChevronUp, RotateCcw, CheckCircle2 } from 'lucide-react';

type RegenStatus = 'idle' | 'suggesting' | 'generating' | 'done' | 'error';

interface RePromptPanelProps {
  projectId: string;
  onRegenerationComplete: (version: number) => void;
}

export default function RePromptPanel({ projectId, onRegenerationComplete }: RePromptPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [status, setStatus] = useState<RegenStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchSuggestions = useCallback(async (currentFeedback?: string) => {
    setStatus('suggesting');
    setSuggestions([]);
    try {
      const res = await fetch('/api/v1/suggest-modification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, prompt: currentFeedback ?? feedback }),
      });
      const data = await res.json();
      setSuggestions(data.data?.suggestions ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setStatus('idle');
    }
  }, [projectId, feedback]);

  const handleRegenerate = useCallback(async () => {
    const trimmed = feedback.trim();

    // If prompt is too short or vague, show suggestions first
    if (trimmed.length < 10 && suggestions.length === 0) {
      await fetchSuggestions(trimmed);
      return;
    }

    setStatus('generating');
    setProgress(0);
    setErrorMsg('');

    try {
      const res = await fetch('/api/v1/generate/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, feedback: trimmed || '현재 웹서비스를 개선해주세요.' }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? '재생성에 실패했습니다.');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('스트림을 읽을 수 없습니다.');

      const pollForRegeneration = async (projectId: string) => {
        const MAX_ATTEMPTS = 120;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          try {
            const res = await fetch(`/api/v1/generate/status/${projectId}`);
            if (!res.ok) break;
            const { data } = (await res.json()) as {
              data: {
                status: 'generating' | 'completed' | 'failed' | 'unknown';
                progress?: number;
                message?: string;
                result?: { projectId: string; version: number };
                error?: string;
              };
            };
            if (data.status === 'generating') {
              setProgress(data.progress ?? 0);
              setProgressMsg(data.message ?? '재생성 중...');
            } else if (data.status === 'completed' && data.result) {
              setProgress(100);
              setStatus('done');
              setFeedback('');
              setSuggestions([]);
              onRegenerationComplete(data.result.version ?? 1);
              return;
            } else if (data.status === 'failed') {
              throw new Error(data.error ?? '재생성 실패');
            } else {
              setStatus('error');
              setErrorMsg('연결이 복구되지 않았습니다. 대시보드에서 결과를 확인해주세요.');
              return;
            }
          } catch (err) {
            if (attempt === MAX_ATTEMPTS - 1) {
              setStatus('error');
              setErrorMsg(err instanceof Error ? err.message : '폴링 중 오류 발생');
              return;
            }
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        }
        setStatus('error');
        setErrorMsg('재생성 시간이 초과되었습니다. 대시보드에서 확인해주세요.');
      };

      let switchedToPolling = false;
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && !switchedToPolling) {
          switchedToPolling = true;
          reader.cancel().catch(() => {});
          void pollForRegeneration(projectId);
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      let buffer = '';
      let done = false;

      try {
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const block of events) {
            if (!block.trim()) continue;
            let eventType = 'message';
            let eventData = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              else if (line.startsWith('data: ')) eventData = line.slice(6);
            }
            if (!eventData) continue;

            let parsed: Record<string, unknown>;
            try { parsed = JSON.parse(eventData); } catch { continue; }

            if (eventType === 'progress') {
              setProgress((parsed.progress as number) ?? 0);
              setProgressMsg((parsed.message as string) ?? '');
            } else if (eventType === 'complete') {
              setProgress(100);
              setStatus('done');
              setFeedback('');
              setSuggestions([]);
              onRegenerationComplete((parsed.version as number) ?? 1);
              return;
            } else if (eventType === 'error') {
              throw new Error((parsed.message as string) ?? '재생성 실패');
            }
          }
        }
      }

      // Stream ended without 'complete' event
      if (!switchedToPolling) {
        void pollForRegeneration(projectId);
      }
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : '알 수 없는 오류');
      } finally {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : '알 수 없는 오류');
    }
  }, [feedback, suggestions, projectId, fetchSuggestions, onRegenerationComplete]);

  const handleSelectSuggestion = (suggestion: string) => {
    setFeedback(suggestion);
    setSuggestions([]);
  };

  const handleReset = () => {
    setStatus('idle');
    setProgress(0);
    setProgressMsg('');
    setErrorMsg('');
  };

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
    >
      {/* 헤더 토글 */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 transition-colors"
        style={{ color: 'var(--text)' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: 'rgba(155,109,255,0.15)' }}
          >
            <Wand2 className="h-3.5 w-3.5" style={{ color: 'var(--violet)' }} />
          </div>
          <span className="text-sm font-semibold">프롬프트로 수정하기</span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: 'rgba(155,109,255,0.15)', color: 'var(--violet)' }}
          >
            AI
          </span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4" style={{ color: 'var(--text-2)' }} />
        ) : (
          <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-2)' }} />
        )}
      </button>

      {/* 패널 내용 */}
      {isOpen && (
        <div className="px-5 pb-5" style={{ borderTop: '1px solid var(--border)' }}>
          {/* 완료 상태 */}
          {status === 'done' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--emerald)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--emerald)' }}>
                수정이 완료되었습니다!
              </p>
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-2)' }}
              >
                <RotateCcw className="h-3 w-3" />
                추가 수정하기
              </button>
            </div>
          )}

          {/* 생성 중 상태 */}
          {status === 'generating' && (
            <div className="py-5">
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-2)' }}>
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--violet)' }} />
                <span>{progressMsg || '수정 중...'}</span>
              </div>
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full"
                style={{ background: 'var(--bg-surface)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, var(--violet), var(--cyan))',
                  }}
                />
              </div>
              <p className="mt-1.5 text-right text-xs" style={{ color: 'var(--text-3)' }}>
                {progress}%
              </p>
            </div>
          )}

          {/* 입력 상태 */}
          {(status === 'idle' || status === 'suggesting' || status === 'error') && (
            <div className="mt-4 space-y-3">
              {/* 입력 안내 */}
              <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                원하는 수정 사항을 입력하거나, AI 추천을 받아보세요.
                이전에 선택한 API는 자동으로 포함됩니다.
              </p>

              {/* 텍스트에어리어 */}
              <div className="relative">
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="예: 차트를 막대 그래프로 변경하고, 날짜 필터를 추가해주세요."
                  rows={3}
                  className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none transition-all"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    caretColor: 'var(--cyan)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-active)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }}
                />
              </div>

              {/* 에러 메시지 */}
              {status === 'error' && errorMsg && (
                <p className="text-xs" style={{ color: 'var(--rose)' }}>
                  오류: {errorMsg}
                </p>
              )}

              {/* 액션 버튼 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fetchSuggestions()}
                  disabled={status === 'suggesting'}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all disabled:opacity-50"
                  style={{
                    background: 'rgba(155,109,255,0.12)',
                    color: 'var(--violet)',
                    border: '1px solid rgba(155,109,255,0.2)',
                  }}
                >
                  {status === 'suggesting' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  AI 추천 받기
                </button>

                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={status === 'suggesting'}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white transition-all disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, var(--violet), var(--cyan))',
                    boxShadow: '0 2px 12px rgba(155,109,255,0.3)',
                  }}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  수정 생성
                </button>
              </div>

              {/* 추천 제안 */}
              {suggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                    AI 추천 수정 방향
                  </p>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectSuggestion(s)}
                      className="w-full rounded-xl p-3 text-left text-xs transition-all"
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-active)';
                        e.currentTarget.style.background = 'var(--bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.background = 'var(--bg-surface)';
                      }}
                    >
                      <span
                        className="mr-2 inline-block h-4 w-4 rounded-full text-center text-xs font-bold leading-4"
                        style={{
                          background: 'rgba(155,109,255,0.2)',
                          color: 'var(--violet)',
                          fontSize: '10px',
                        }}
                      >
                        {i + 1}
                      </span>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
