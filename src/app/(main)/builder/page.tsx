'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CatalogView } from '@/components/catalog/CatalogView';
import StepIndicator from '@/components/builder/StepIndicator';
import BuilderModeToggle from '@/components/builder/BuilderModeToggle';
import SelectedApiZone from '@/components/builder/SelectedApiZone';
import ContextInput from '@/components/builder/ContextInput';
import ContextSuggestions from '@/components/builder/ContextSuggestions';
import GuideQuestions from '@/components/builder/GuideQuestions';
import TemplateSelector from '@/components/builder/TemplateSelector';
import type { Template } from '@/components/builder/TemplateSelector';
import GenerationProgress from '@/components/builder/GenerationProgress';
import PreviewFrame from '@/components/builder/PreviewFrame';
import ApiRecommendations from '@/components/builder/ApiRecommendations';
import type { ApiRecommendation } from '@/components/builder/ApiRecommendations';
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
  const [step, setStep] = useState(1);
  const [apis, setApis] = useState<ApiCatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);

  // Context suggestion state (for api-first mode)
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);

  // API recommendation state (for context-first mode)
  const [apiRecommendations, setApiRecommendations] = useState<ApiRecommendation[]>([]);
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(false);

  const { mode, setMode } = useBuilderModeStore();
  const { selectedApis, addApi, removeApi, clearApis } = useApiSelectionStore();

  const {
    context,
    setContext,
    setTemplate,
    isValid: isContextValid,
    reset: resetContext,
  } = useContextStore();

  const {
    status: genStatus,
    progress,
    currentStep: genStep,
    error: genError,
    projectId,
    startGeneration,
    updateProgress,
    completeGeneration,
    failGeneration,
    reset: resetGeneration,
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

  // Reset step when mode changes
  const handleModeChange = useCallback(
    (newMode: BuilderMode) => {
      setMode(newMode);
      setStep(1);
      clearApis();
      resetContext();
      setSuggestions([]);
      setApiRecommendations([]);
      setActiveSuggestionIndex(null);
    },
    [setMode, clearApis, resetContext]
  );

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
        }),
      });

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}));
        throw new Error(errData.error?.message ?? '프로젝트 생성에 실패했습니다.');
      }

      const { data: project } = await createRes.json();

      updateProgress(10, 'AI 코드 생성 시작...');
      const genRes = await fetch('/api/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });

      if (!genRes.ok) {
        const errData = await genRes.json().catch(() => ({}));
        throw new Error(errData.error?.message ?? '코드 생성에 실패했습니다.');
      }

      const reader = genRes.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('스트림을 읽을 수 없습니다.');

      let buffer = '';
      let done = false;
      let generationCompleted = false;

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

            let parsed;
            try {
              parsed = JSON.parse(eventData);
            } catch {
              console.warn('[SSE] Failed to parse event data', { eventType, eventData });
              continue;
            }

            if (eventType === 'progress') {
              updateProgress(parsed.progress ?? 0, parsed.message ?? '');
            } else if (eventType === 'complete') {
              completeGeneration(parsed.projectId ?? project.id);
              resetContext();
              clearApis();
              generationCompleted = true;
              return;
            } else if (eventType === 'error') {
              throw new Error(parsed.message ?? '코드 생성에 실패했습니다.');
            }
          }
        }
      }

      if (!generationCompleted) {
        completeGeneration(project.id);
        resetContext();
        clearApis();
      }
    } catch (err) {
      failGeneration(err instanceof Error ? err.message : '알 수 없는 오류');
    }
  }, [selectedApis, selectedIds, context, startGeneration, updateProgress, completeGeneration, failGeneration, resetContext, clearApis]);

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
      if (!res.ok) throw new Error('Failed to fetch suggestions');
      const data = await res.json();
      setSuggestions(data.data?.suggestions ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setIsSuggestionsLoading(false);
    }
  }, [selectedApis]);

  // === Context-first mode: fetch API recommendations ===
  const fetchApiRecommendations = useCallback(async () => {
    if (!context || context.length < 10) return;
    setIsRecommendationsLoading(true);
    setApiRecommendations([]);
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
      // Auto-select all recommended APIs
      clearApis();
      for (const rec of recs) {
        addApi(rec.api);
      }
    } catch {
      setApiRecommendations([]);
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
      fetchApiRecommendations();
    }
  }, [step, mode, fetchSuggestions, fetchApiRecommendations]);

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

  // === Determine navigation validity ===
  const canProceedStep1 =
    mode === 'api-first' ? selectedApis.length > 0 : isContextValid();
  const canProceedStep2 =
    mode === 'api-first' ? isContextValid() : selectedApis.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <BuilderModeToggle mode={mode} onChange={handleModeChange} />
      <StepIndicator currentStep={step} steps={steps} />

      {/* ===================== API-FIRST MODE ===================== */}
      {mode === 'api-first' && (
        <>
          {/* Step 1: API Selection */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white">사용할 API를 선택하세요</h2>
              <p className="text-sm text-slate-400">
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
                  <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
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
                <h2 className="text-xl font-bold text-white">어떤 서비스를 만들고 싶으세요?</h2>
                <p className="mt-1 text-sm text-slate-400">
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
                  <label className="text-sm font-medium text-slate-300">서비스 설명</label>
                  {activeSuggestionIndex !== null && (
                    <span className="flex items-center gap-1 text-xs text-cyan-400">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />
                      추천 {activeSuggestionIndex + 1} 적용됨
                    </span>
                  )}
                </div>
                <ContextInput value={context} onChange={handleContextChange} />
              </div>

              <GuideQuestions onInsert={handleInsertGuide} />
              <TemplateSelector onSelect={handleApplyTemplate} />
            </div>
          )}

          {/* Step 3: Generation */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white">서비스 생성</h2>

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

              {genStatus === 'completed' && projectId && <PreviewFrame projectId={projectId} />}
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
                <h2 className="text-xl font-bold text-white">어떤 서비스를 만들고 싶으세요?</h2>
                <p className="mt-1 text-sm text-slate-400">
                  서비스를 설명하면 AI가 가장 적합한 API를 자동으로 찾아줍니다.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">서비스 설명</label>
                <ContextInput value={context} onChange={handleContextChange} />
              </div>

              <GuideQuestions onInsert={handleInsertGuide} />
              <TemplateSelector onSelect={handleApplyTemplate} />
            </div>
          )}

          {/* Step 2: API Matching */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">추천된 API를 확인하세요</h2>
                <p className="mt-1 text-sm text-slate-400">
                  AI가 서비스 설명을 분석하여 최적의 API를 추천했습니다. 추가/제거할 수 있습니다.
                </p>
              </div>

              <ApiRecommendations
                recommendations={apiRecommendations}
                isLoading={isRecommendationsLoading}
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
                <summary className="cursor-pointer text-sm font-medium text-slate-400 transition-colors hover:text-white">
                  직접 API 추가하기 ▸
                </summary>
                <div className="mt-4">
                  {isLoadingCatalog ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
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
              <h2 className="text-xl font-bold text-white">서비스 생성</h2>

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

              {genStatus === 'completed' && projectId && <PreviewFrame projectId={projectId} />}
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
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="btn-secondary inline-flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          이전
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
