'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CatalogView } from '@/components/catalog/CatalogView';
import StepIndicator from '@/components/builder/StepIndicator';
import SelectedApiZone from '@/components/builder/SelectedApiZone';
import ContextInput from '@/components/builder/ContextInput';
import ContextSuggestions from '@/components/builder/ContextSuggestions';
import GuideQuestions from '@/components/builder/GuideQuestions';
import TemplateSelector from '@/components/builder/TemplateSelector';
import type { Template } from '@/components/builder/TemplateSelector';
import GenerationProgress from '@/components/builder/GenerationProgress';
import PreviewFrame from '@/components/builder/PreviewFrame';
import { useApiSelectionStore } from '@/stores/apiSelectionStore';
import { useContextStore } from '@/stores/contextStore';
import { useGenerationStore } from '@/stores/generationStore';
import { LIMITS } from '@/lib/config/features';
import type { ApiCatalogItem, Category } from '@/types/api';
import { ChevronLeft, ChevronRight, Sparkles, Loader2 } from 'lucide-react';

const STEPS = [{ label: 'API 선택' }, { label: '서비스 설명' }, { label: '생성' }];

export default function BuilderPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [apis, setApis] = useState<ApiCatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);

  // Context suggestion state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);

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

  const selectedIds = selectedApis.map((a) => a.id);
  const canProceedStep1 = selectedApis.length > 0;
  const canProceedStep2 = isContextValid();

  const handleGenerate = async () => {
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

          // Process complete SSE events (separated by double newlines)
          const events = buffer.split('\n\n');
          // Keep the last part as it may be incomplete
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
  };

  const fetchSuggestions = async () => {
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
  };

  const handleNextStep = () => {
    const next = Math.min(3, step + 1);
    setStep(next);
    if (step === 1) {
      fetchSuggestions();
    }
  };

  const handleSelectSuggestion = (suggestion: string, index: number) => {
    setContext(suggestion);
    setActiveSuggestionIndex(index);
  };

  const handleContextChange = (value: string) => {
    setContext(value);
    // Clear active marker if user edits away from the selected suggestion
    if (activeSuggestionIndex !== null && value !== suggestions[activeSuggestionIndex]) {
      setActiveSuggestionIndex(null);
    }
  };

  const handleApplyTemplate = (template: Template) => {
    setContext(template.text);
    setTemplate(template.id);
    setActiveSuggestionIndex(null);
  };

  const handleInsertGuide = (text: string) => {
    setContext(context + text);
    setActiveSuggestionIndex(null);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <StepIndicator currentStep={step} steps={STEPS} />

      {/* Step 1: API Selection */}
      {step === 1 && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900">사용할 API를 선택하세요</h2>
          <p className="text-sm text-gray-500">
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
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
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
            <h2 className="text-xl font-bold text-gray-900">어떤 서비스를 만들고 싶으세요?</h2>
            <p className="mt-1 text-sm text-gray-500">
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
              <label className="text-sm font-medium text-gray-700">서비스 설명</label>
              {activeSuggestionIndex !== null && (
                <span className="flex items-center gap-1 text-xs text-blue-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
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
          <h2 className="text-xl font-bold text-gray-900">서비스 생성</h2>

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

      {/* Navigation */}
      <div className="mt-10 flex items-center justify-between border-t border-gray-200 pt-6">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          이전
        </button>

        {step < 3 && (
          <button
            type="button"
            onClick={handleNextStep}
            disabled={(step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2)}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            다음
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {step === 3 && genStatus === 'idle' && (
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Sparkles className="h-4 w-4" />
            생성하기
          </button>
        )}
      </div>
    </div>
  );
}
