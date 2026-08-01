'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Sparkles, Wand2, Loader2, ChevronDown, ChevronUp, RotateCcw, CheckCircle2 } from 'lucide-react';
import { runClientRegeneration } from '@/lib/generation/runClientRegeneration';
import { abortRegenerationSession } from '@/lib/generation/regenerationSession';

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

  // 로컬 terminal 가드 — generationStore 래치가 적용되지 않으므로
  // 늦게 도착한 poll terminal 이 끝난 재생성/onRegenerationComplete 를 덮어쓰지 못하게 한다.
  const runIdRef = useRef(0);
  const terminalForRunRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      // 언마운트 시 네트워크도 실제로 취소 (이전 mountedRef 만으로는 state write 만 막혔음)
      abortRegenerationSession();
    };
  }, []);

  /**
   * 현재 실행에만 상태/콜백을 적용.
   * terminal 확정 후 같은 run 의 late 콜백(이중 complete/fail)은 무시한다.
   */
  const guardWrite = useCallback((runId: number, isTerminal: boolean, fn: () => void): void => {
    if (runId !== runIdRef.current) return;
    if (terminalForRunRef.current === runId) return;
    if (isTerminal) {
      terminalForRunRef.current = runId;
    }
    fn();
  }, []);

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
    // in-flight 중복 제출 차단 (generating UI 전에 더블클릭 등)
    if (status === 'generating' || status === 'suggesting') return;

    const trimmed = feedback.trim();

    // If prompt is too short or vague, show suggestions first
    if (trimmed.length < 10 && suggestions.length === 0) {
      await fetchSuggestions(trimmed);
      return;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    terminalForRunRef.current = null;

    setStatus('generating');
    setProgress(0);
    setProgressMsg('');
    setErrorMsg('');

    await runClientRegeneration(
      {
        projectId,
        feedback: trimmed || '현재 웹서비스를 개선해주세요.',
      },
      {
        updateProgress: (p, message) => {
          guardWrite(runId, false, () => {
            setProgress(p);
            setProgressMsg(message);
          });
        },
        completeRegeneration: (version) => {
          guardWrite(runId, true, () => {
            setProgress(100);
            setStatus('done');
            setFeedback('');
            setSuggestions([]);
            onRegenerationComplete(version ?? 1);
          });
        },
        failRegeneration: (message) => {
          guardWrite(runId, true, () => {
            setStatus('error');
            setErrorMsg(message);
          });
        },
      },
    );
  }, [
    status,
    feedback,
    suggestions,
    projectId,
    fetchSuggestions,
    onRegenerationComplete,
    guardWrite,
  ]);

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
