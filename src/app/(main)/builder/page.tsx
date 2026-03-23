'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CatalogView } from '@/components/catalog/CatalogView';
import StepIndicator from '@/components/builder/StepIndicator';
import SelectedApiZone from '@/components/builder/SelectedApiZone';
import ContextInput from '@/components/builder/ContextInput';
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

const STEPS = [
  { label: 'API 선택' },
  { label: '서비스 설명' },
  { label: '생성' },
];

export default function BuilderPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [apis, setApis] = useState<ApiCatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);

  const {
    selectedApis,
    addApi,
    removeApi,
    clearApis,
  } = useApiSelectionStore();

  const {
    context,
    setContext,
    setTemplate,
    isValid: isContextValid,
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
          fetch('/api/v1/catalog', { signal: abortCtrl.signal }),
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

      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const eventData = JSON.parse(line.slice(6));
                if (eventData.progress !== undefined) {
                  updateProgress(eventData.progress, eventData.message ?? '');
                }
                if (eventData.projectId && eventData.version !== undefined) {
                  completeGeneration(eventData.projectId);
                  return;
                }
                if (eventData.message && !eventData.progress) {
                  throw new Error(eventData.message);
                }
              } catch (parseErr) {
                if (parseErr instanceof Error && parseErr.message !== line.slice(6)) {
                  throw parseErr;
                }
              }
            }
          }
        }
      }

      if (genStatus !== 'completed') {
        completeGeneration(project.id);
      }
    } catch (err) {
      failGeneration(err instanceof Error ? err.message : '알 수 없는 오류');
    }
  };

  const handleApplyTemplate = (template: Template) => {
    setContext(template.text);
    setTemplate(template.id);
  };

  const handleInsertGuide = (text: string) => {
    setContext(context + text);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <StepIndicator currentStep={step} steps={STEPS} />

      {/* Step 1: API Selection */}
      {step === 1 && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900">
            사용할 API를 선택하세요
          </h2>
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
          <h2 className="text-xl font-bold text-gray-900">
            어떤 서비스를 만들고 싶으세요?
          </h2>

          <GuideQuestions onInsert={handleInsertGuide} />

          <TemplateSelector onSelect={handleApplyTemplate} />

          <ContextInput value={context} onChange={setContext} />
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

          {genStatus === 'completed' && projectId && (
            <PreviewFrame projectId={projectId} />
          )}
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
            onClick={() => setStep((s) => Math.min(3, s + 1))}
            disabled={
              (step === 1 && !canProceedStep1) ||
              (step === 2 && !canProceedStep2)
            }
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
