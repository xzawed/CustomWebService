'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CatalogView } from '@/components/catalog/CatalogView';
import StepIndicator from '@/components/builder/StepIndicator';
import BuilderModeSelector from '@/components/builder/BuilderModeSelector';
import BuilderModeToggle from '@/components/builder/BuilderModeToggle';
import SelectedApiZone from '@/components/builder/SelectedApiZone';
import ContextInput from '@/components/builder/ContextInput';
import ContextSuggestions from '@/components/builder/ContextSuggestions';
import GuideQuestions from '@/components/builder/GuideQuestions';
import TemplateSelector from '@/components/builder/TemplateSelector';
import DesignPreferences from '@/components/builder/DesignPreferences';
import type { Template } from '@/components/builder/TemplateSelector';
import GenerationProgress from '@/components/builder/GenerationProgress';
import PreviewFrame from '@/components/builder/PreviewFrame';
import RePromptPanel from '@/components/builder/RePromptPanel';
import ApiRecommendations from '@/components/builder/ApiRecommendations';
import type { ApiRecommendation } from '@/components/builder/ApiRecommendations';
import PopularServiceSuggestions from '@/components/builder/PopularServiceSuggestions';
import type { PopularService } from '@/components/builder/PopularServiceSuggestions';
import { useApiSelectionStore } from '@/stores/apiSelectionStore';
import { useContextStore } from '@/stores/contextStore';
import { useGenerationStore } from '@/stores/generationStore';
import { useBuilderModeStore } from '@/stores/builderModeStore';
import type { BuilderMode } from '@/stores/builderModeStore';
import { LIMITS } from '@/lib/config/features';
import type { ApiCatalogItem, Category } from '@/types/api';
import { ChevronLeft, ChevronRight, Sparkles, Loader2 } from 'lucide-react';

const STEPS_API_FIRST = [{ label: 'API 선택' }, { label: '서비스 설명' }, { label: '생성' }];
const STEPS_CONTEXT_FIRST = [{ label: '서비스 설명' }, { label: 'API 매칭' }, { label: '생성' }];

export default function BuilderPage() {
  const router = useRouter();
  const [modeConfirmed, setModeConfirmed] = useState(false);
  const [step, setStep] = useState(1);
  const [apis, setApis] = useState<ApiCatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [regenVersion, setRegenVersion] = useState<number | undefined>(undefined);

  // Context suggestion state (for api-first mode)
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);

  // API recommendation state (for context-first mode)
  const [apiRecommendations, setApiRecommendations] = useState<ApiRecommendation[]>([]);
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState(false);
  const [lastRecommendedContext, setLastRecommendedContext] = useState<string | null>(null);

  const { mode, setMode } = useBuilderModeStore();
  const { selectedApis, addApi, removeApi, clearApis } = useApiSelectionStore();

  const {
    context,
    setContext,
    setTemplate,
    selectedTemplate,
    isValid: isContextValid,
    getDesignPreferences,
    reset: resetContext,
  } = useContextStore();

  const {
    status: genStatus,
    progress,
    currentStep: genStep,
    error: genError,
    projectId,
    version,
    startGeneration,
    updateProgress,
    completeGeneration,
    failGeneration,
    reset: resetGeneration,
    setGeneratingProjectId,
  } = useGenerationStore();

  const steps = mode === 'api-first' ? STEPS_API_FIRST : STEPS_CONTEXT_FIRST;
  const selectedIds = selectedApis.map((a) => a.id);

  useEffect(() => {
    const abortCtrl = new AbortController();
    async function loadCatalog() {
      try {
        const [apisRes, catsRes] = await Promise.all([
          fetch('/api/v1/catalog?limit=100', { signal: abortCtrl.signal }),
          fetch('/api/v1/catalog/categories', { signal: abortCtrl.signal }),
        ]);
        if (!apisRes.ok || !catsRes.ok) {
          throw new Error('API 카탈로그를 불러올 수 없습니다.');
        }
        const apisData = await apisRes.json();
        const catsData = await catsRes.json();
        if (!abortCtrl.signal.aborted) {
          setApis(apisData.data?.items ?? []);
          setCategories(catsData.data ?? []);
        }
      } catch (err) {
        if (!abortCtrl.signal.aborted) {
          console.warn('Failed to load catalog:', err instanceof Error ? err.message : err);
        }
      } finally {
        if (!abortCtrl.signal.aborted) {
          setIsLoadingCatalog(false);
        }
      }
    }
    loadCatalog();
    return () => abortCtrl.abort();
  }, []);

  // === Mode selection from big cards ===
  const handleModeSelect = useCallback(
    (selectedMode: BuilderMode) => {
      setMode(selectedMode);
      setModeConfirmed(true);
      setStep(1);
      clearApis();
      resetContext();
      setSuggestions([]);
      setApiRecommendations([]);
      setRecommendationsError(false);
      setLastRecommendedContext(null);
      setActiveSuggestionIndex(null);
    },
    [setMode, clearApis, resetContext]
  );

  // === Go back to mode selection ===
  const handleResetMode = useCallback(() => {
    setModeConfirmed(false);
    setStep(1);
    clearApis();
    resetContext();
    resetGeneration();
    setSuggestions([]);
    setApiRecommendations([]);
    setRecommendationsError(false);
    setLastRecommendedContext(null);
    setActiveSuggestionIndex(null);
  }, [clearApis, resetContext, resetGeneration]);

  const handleGenerate = useCallback(async () => {
    startGeneration();

    try {
      updateProgress(5, '프로젝트 생성 중...');
      const createRes = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `프로젝트-${Date.now()}`,
          context,
          apiIds: selectedIds,
          designPreferences: getDesignPreferences(),
        }),
      });

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}));
        throw new Error(errData.error?.message ?? '프로젝트 생성에 실패했습니다.');
      }

      const { data: project } = await createRes.json();
      setGeneratingProjectId(project.id);

      updateProgress(10, 'AI 코드 생성 시작...');
      const genRes = await fetch('/api/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, templateId: selectedTemplate ?? undefined }),
      });

      if (!genRes.ok) {
        const errData = await genRes.json().catch(() => ({}));
        throw new Error(errData.error?.message ?? '코드 생성에 실패했습니다.');
      }

      const reader = genRes.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('스트림을 읽을 수 없습니다.');

      const pollForCompletion = async (projectId: string) => {
        const MAX_ATTEMPTS = 120; // 2 minutes at 1s intervals
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
              updateProgress(data.progress ?? 0, data.message ?? '생성 중...');
            } else if (data.status === 'completed' && data.result) {
              completeGeneration(data.result.projectId, data.result.version);
              resetContext();
              clearApis();
              return;
            } else if (data.status === 'failed') {
              throw new Error(data.error ?? '코드 생성에 실패했습니다.');
            } else {
              // 'unknown' — tracker entry expired or server restarted
              failGeneration('연결이 복구되지 않았습니다. 대시보드에서 결과를 확인해주세요.');
              return;
            }
          } catch (err) {
            if (attempt === MAX_ATTEMPTS - 1) {
              failGeneration(err instanceof Error ? err.message : '폴링 중 오류 발생');
              return;
            }
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        }
        failGeneration('생성 시간이 초과되었습니다. 대시보드에서 확인해주세요.');
      };

      let buffer = '';
      let done = false;
      let generationCompleted = false;
      let switchedToPolling = false;
      let sseErrorEvent = false;
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && !generationCompleted && !switchedToPolling) {
          switchedToPolling = true;
          reader.cancel().catch(() => {});
          void pollForCompletion(project.id);
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      try {
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) {
            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';

            for (const eventBlock of events) {
              if (!eventBlock.trim()) continue;

              let eventType = 'message';
              let eventData = '';

              for (const line of eventBlock.split('\n')) {
                if (line.startsWith('event: ')) {
                  eventType = line.slice(7).trim();
                } else if (line.startsWith('data: ')) {
                  eventData = line.slice(6);
                }
              }

              if (!eventData) continue;

              let parsed: Record<string, unknown>;
              try {
                parsed = JSON.parse(eventData) as Record<string, unknown>;
              } catch {
                console.warn('[SSE] Failed to parse event data', { eventType, eventData });
                continue;
              }

              if (eventType === 'progress') {
                updateProgress((parsed.progress as number) ?? 0, (parsed.message as string) ?? '');
              } else if (eventType === 'complete') {
                completeGeneration((parsed.projectId as string) ?? project.id, parsed.version as number | undefined);
                resetContext();
                clearApis();
                generationCompleted = true;
                return;
              } else if (eventType === 'error') {
                sseErrorEvent = true;
                throw new Error((parsed.message as string) ?? '코드 생성에 실패했습니다.');
              }
            }
          }
        }

        if (!generationCompleted && !switchedToPolling) {
          // SSE stream ended without 'complete' event and we didn't already switch to polling
          // This can happen on mobile disconnect. Switch to polling to check actual server status.
          void pollForCompletion(project.id);
        }
      } catch (streamErr) {
        if (sseErrorEvent) {
          // 서버가 보낸 SSE error 이벤트 — 외부 catch로 전파
          throw streamErr;
        }
        // 스트림 읽기 에러 (모바일 백그라운드 전환으로 연결 끊김 등) — 폴링으로 전환
        if (!generationCompleted && !switchedToPolling) {
          switchedToPolling = true;
          void pollForCompletion(project.id);
        }
      } finally {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        reader.cancel().catch(() => {});
      }
    } catch (err) {
      failGeneration(err instanceof Error ? err.message : '알 수 없는 오류');
    }
  }, [selectedIds, context, selectedTemplate, startGeneration, updateProgress, completeGeneration, failGeneration, resetContext, clearApis, setGeneratingProjectId]);

  // === API-first mode: fetch context suggestions ===
  const fetchSuggestions = useCallback(async () => {
    if (selectedApis.length === 0) return;
    setIsSuggestionsLoading(true);
    setSuggestions([]);
    setActiveSuggestionIndex(null);
    try {
      const res = await fetch('/api/v1/suggest-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apis: selectedApis.map((a) => ({
            name: a.name,
            description: a.description,
            category: a.category,
          })),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error('[suggest-context]', res.status, errBody?.error?.message ?? 'Unknown error');
        throw new Error(errBody?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSuggestions(data.data?.suggestions ?? []);
    } catch (err) {
      console.error('[suggest-context] failed:', err instanceof Error ? err.message : err);
      setSuggestions([]);
    } finally {
      setIsSuggestionsLoading(false);
    }
  }, [selectedApis]);

  // === Context-first mode: fetch API recommendations ===
  const fetchApiRecommendations = useCallback(async () => {
    if (!context || context.length < LIMITS.contextMinLength) return;
    setIsRecommendationsLoading(true);
    setApiRecommendations([]);
    setRecommendationsError(false);
    try {
      const res = await fetch('/api/v1/suggest-apis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });
      if (!res.ok) throw new Error('Failed to fetch API recommendations');
      const data = await res.json();
      const recs: ApiRecommendation[] = data.data?.recommendations ?? [];
      setApiRecommendations(recs);
      setLastRecommendedContext(context);
      // Auto-select all recommended APIs
      clearApis();
      for (const rec of recs) {
        addApi(rec.api);
      }
    } catch {
      setApiRecommendations([]);
      setRecommendationsError(true);
      setLastRecommendedContext(null);
    } finally {
      setIsRecommendationsLoading(false);
    }
  }, [context, clearApis, addApi]);

  const handleNextStep = useCallback(() => {
    const next = Math.min(3, step + 1);
    setStep(next);

    if (mode === 'api-first' && step === 1) {
      fetchSuggestions();
    }
    if (mode === 'context-first' && step === 1) {
      if (context !== lastRecommendedContext) {
        fetchApiRecommendations();
      }
    }
  }, [step, mode, context, lastRecommendedContext, fetchSuggestions, fetchApiRecommendations]);

  const handlePrevStep = useCallback(() => {
    if (step === 1) {
      handleResetMode();
    } else {
      setStep((s) => Math.max(1, s - 1));
    }
  }, [step, handleResetMode]);

  const handleSelectSuggestion = useCallback(
    (suggestion: string, index: number) => {
      setContext(suggestion);
      setActiveSuggestionIndex(index);
    },
    [setContext]
  );

  const handleContextChange = useCallback(
    (value: string) => {
      setContext(value);
      if (activeSuggestionIndex !== null && value !== suggestions[activeSuggestionIndex]) {
        setActiveSuggestionIndex(null);
      }
    },
    [setContext, activeSuggestionIndex, suggestions]
  );

  const handleApplyTemplate = useCallback(
    (template: Template) => {
      setContext(template.text);
      setTemplate(template.id);
      setActiveSuggestionIndex(null);
    },
    [setContext, setTemplate]
  );

  const handleInsertGuide = useCallback(
    (text: string) => {
      setContext(context + text);
      setActiveSuggestionIndex(null);
    },
    [setContext, context]
  );

  // === Context-first mode: select popular service ===
  const handleSelectPopularService = useCallback(
    (service: PopularService) => {
      setContext(service.context);
      if (service.apiIds.length > 0) {
        clearApis();
        for (const apiId of service.apiIds) {
          const api = apis.find((a) => a.id === apiId);
          if (api) addApi(api);
        }
        setApiRecommendations(
          service.apiIds
            .map((apiId) => {
              const api = apis.find((a) => a.id === apiId);
              return api ? { api, reason: '인기 서비스 추천 API' } : null;
            })
            .filter((r): r is ApiRecommendation => r !== null)
        );
        setLastRecommendedContext(service.context);
        setRecommendationsError(false);
      }
    },
    [setContext, clearApis, addApi, apis]
  );

  // === Determine navigation validity ===
  const canProceedStep1 =
    mode === 'api-first' ? selectedApis.length > 0 : isContextValid();
  const canProceedStep2 =
    mode === 'api-first' ? isContextValid() : selectedApis.length > 0;

  // ======================================================
  // MODE SELECTION SCREEN (entry point)
  // ======================================================
  if (!modeConfirmed) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <BuilderModeSelector onSelect={handleModeSelect} />
      </div>
    );
  }

  // ======================================================
  // BUILDER FLOW (after mode is confirmed)
  // ======================================================
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <BuilderModeToggle
        mode={mode}
        onReset={handleResetMode}
        disabled={step === 3 && genStatus !== 'idle'}
      />
      <StepIndicator currentStep={step} steps={steps} />

      {/* ===================== API-FIRST MODE ===================== */}
      {mode === 'api-first' && (
        <>
          {/* Step 1: API Selection */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>사용할 API를 선택하세요</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                최대 {LIMITS.maxApisPerProject}개의 API를 선택할 수 있습니다.
              </p>

              <SelectedApiZone
                selectedApis={selectedApis}
                onRemove={removeApi}
                onClear={clearApis}
                maxCount={LIMITS.maxApisPerProject}
              />

              {isLoadingCatalog ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                </div>
              ) : (
                <CatalogView
                  initialApis={apis}
                  categories={categories}
                  selectionMode
                  selectedIds={selectedIds}
                  onSelect={addApi}
                  onDeselect={removeApi}
                />
              )}
            </div>
          )}

          {/* Step 2: Context Input */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>어떤 서비스를 만들고 싶으세요?</h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  선택한 API를 기반으로 AI가 추천한 아이디어를 활용하거나, 직접 입력하세요.
                </p>
              </div>

              <ContextSuggestions
                suggestions={suggestions}
                isLoading={isSuggestionsLoading}
                activeIndex={activeSuggestionIndex}
                onSelect={handleSelectSuggestion}
                onRefresh={fetchSuggestions}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>서비스 설명</label>
                  {activeSuggestionIndex !== null && (
                    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent-primary)' }}>
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--accent-primary)' }} />
                      추천 {activeSuggestionIndex + 1} 적용됨
                    </span>
                  )}
                </div>
                <ContextInput value={context} onChange={handleContextChange} />
              </div>

              <GuideQuestions onInsert={handleInsertGuide} />
              <TemplateSelector onSelect={handleApplyTemplate} />
              <DesignPreferences />
            </div>
          )}

          {/* Step 3: Generation */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>서비스 생성</h2>

              <GenerationProgress
                status={genStatus}
                progress={progress}
                currentStep={genStep}
                error={genError}
                selectedApiCount={selectedApis.length}
                onGenerate={handleGenerate}
                onRetry={() => {
                  resetGeneration();
                  handleGenerate();
                }}
                onNavigateDashboard={() => router.push('/dashboard')}
              />

              {genStatus === 'completed' && projectId && (
                <PreviewFrame projectId={projectId} version={regenVersion ?? version ?? undefined} />
              )}
              {genStatus === 'completed' && projectId && (
                <RePromptPanel
                  projectId={projectId}
                  onRegenerationComplete={(v) => setRegenVersion(v)}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* ===================== CONTEXT-FIRST MODE ===================== */}
      {mode === 'context-first' && (
        <>
          {/* Step 1: Context Input */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>어떤 서비스를 만들고 싶으세요?</h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  서비스를 설명하면 AI가 가장 적합한 API를 자동으로 찾아줍니다.
                </p>
              </div>

              {/* Show popular services when context is empty or too short */}
              {context.length < LIMITS.contextMinLength && (
                <PopularServiceSuggestions onSelect={handleSelectPopularService} />
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>서비스 설명</label>
                <ContextInput value={context} onChange={handleContextChange} />
              </div>

              <GuideQuestions onInsert={handleInsertGuide} />
              <TemplateSelector onSelect={handleApplyTemplate} />
              <DesignPreferences />
            </div>
          )}

          {/* Step 2: API Matching */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>추천된 API를 확인하세요</h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  AI가 서비스 설명을 분석하여 최적의 API를 추천했습니다. 추가/제거할 수 있습니다.
                </p>
              </div>

              <ApiRecommendations
                recommendations={apiRecommendations}
                isLoading={isRecommendationsLoading}
                hasError={recommendationsError}
                selectedIds={selectedIds}
                onSelect={addApi}
                onDeselect={removeApi}
                onRefresh={fetchApiRecommendations}
              />

              <SelectedApiZone
                selectedApis={selectedApis}
                onRemove={removeApi}
                onClear={clearApis}
                maxCount={LIMITS.maxApisPerProject}
              />

              {/* Allow manual API browsing/addition */}
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden" style={{ color: 'var(--text-muted)' }}>
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                  직접 API 추가하기
                </summary>
                <div className="mt-4">
                  {isLoadingCatalog ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                    </div>
                  ) : (
                    <CatalogView
                      initialApis={apis}
                      categories={categories}
                      selectionMode
                      selectedIds={selectedIds}
                      onSelect={addApi}
                      onDeselect={removeApi}
                    />
                  )}
                </div>
              </details>
            </div>
          )}

          {/* Step 3: Generation */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>서비스 생성</h2>

              <GenerationProgress
                status={genStatus}
                progress={progress}
                currentStep={genStep}
                error={genError}
                selectedApiCount={selectedApis.length}
                onGenerate={handleGenerate}
                onRetry={() => {
                  resetGeneration();
                  handleGenerate();
                }}
                onNavigateDashboard={() => router.push('/dashboard')}
              />

              {genStatus === 'completed' && projectId && (
                <PreviewFrame projectId={projectId} version={regenVersion ?? version ?? undefined} />
              )}
              {genStatus === 'completed' && projectId && (
                <RePromptPanel
                  projectId={projectId}
                  onRegenerationComplete={(v) => setRegenVersion(v)}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* Navigation */}
      <div
        className="mt-10 flex items-center justify-between pt-6"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <button
          type="button"
          onClick={handlePrevStep}
          className="btn-secondary inline-flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          {step === 1 ? '방식 선택' : '이전'}
        </button>

        {step < 3 && (
          <button
            type="button"
            onClick={handleNextStep}
            disabled={(step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2)}
            className="btn-primary inline-flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            다음
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {step === 3 && genStatus === 'idle' && (
          <button
            type="button"
            onClick={handleGenerate}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            생성하기
          </button>
        )}
      </div>
    </div>
  );
}
