'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CatalogView } from '@/components/catalog/CatalogView';
import { useApiSelectionStore } from '@/stores/apiSelectionStore';
import { useContextStore } from '@/stores/contextStore';
import { useGenerationStore } from '@/stores/generationStore';
import { LIMITS } from '@/lib/config/features';
import type { ApiCatalogItem, Category } from '@/types/api';
import { X, ChevronLeft, ChevronRight, Sparkles, Loader2 } from 'lucide-react';

const GUIDE_QUESTIONS = [
  '이 서비스의 주요 사용자는 누구인가요?',
  '어떤 문제를 해결하려고 하나요?',
  '핵심 기능 3가지를 설명해주세요.',
  'UI/UX 스타일은 어떤 느낌이면 좋을까요?',
];

const TEMPLATES = [
  { id: 'weather-dashboard', label: '날씨 대시보드', text: '현재 위치 기반 날씨 정보를 보여주는 대시보드. 현재 온도, 습도, 풍속을 표시하고 5일 예보를 차트로 보여줍니다. 깔끔한 카드 UI로 구성합니다.' },
  { id: 'news-aggregator', label: '뉴스 모아보기', text: '여러 카테고리의 뉴스를 한 페이지에서 모아 볼 수 있는 서비스. 카테고리별 탭과 검색 기능을 제공하고, 각 뉴스는 카드 형태로 표시합니다.' },
  { id: 'translation-tool', label: '번역 도구', text: '텍스트를 입력하면 다국어로 번역해주는 서비스. 소스 언어 자동 감지, 번역 결과 복사 기능, 최근 번역 히스토리를 제공합니다.' },
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
    charCount,
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
      // Step 1: Create project first
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

      // Step 2: Generate code via SSE
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

      // Read SSE stream
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
                  // Error event
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

      // If stream ended without complete event
      if (genStatus !== 'completed') {
        completeGeneration(project.id);
      }
    } catch (err) {
      failGeneration(err instanceof Error ? err.message : '알 수 없는 오류');
    }
  };

  const handleApplyTemplate = (template: typeof TEMPLATES[number]) => {
    setContext(template.text);
    setTemplate(template.id);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Step Indicator */}
      <div className="mb-10">
        <div className="flex items-center justify-center gap-4">
          {[
            { num: 1, label: 'API 선택' },
            { num: 2, label: '서비스 설명' },
            { num: 3, label: '생성' },
          ].map(({ num, label }, idx) => (
            <div key={num} className="flex items-center gap-4">
              {idx > 0 && (
                <div
                  className={`h-0.5 w-12 ${
                    step > idx ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                    step >= num
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {num}
                </div>
                <span
                  className={`text-sm font-medium ${
                    step >= num ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: API Selection */}
      {step === 1 && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900">
            사용할 API를 선택하세요
          </h2>
          <p className="text-sm text-gray-500">
            최대 {LIMITS.maxApisPerProject}개의 API를 선택할 수 있습니다.
          </p>

          {/* Selected API zone */}
          {selectedApis.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-blue-900">
                  선택된 API ({selectedApis.length}/{LIMITS.maxApisPerProject})
                </span>
                <button
                  type="button"
                  onClick={clearApis}
                  className="text-xs text-blue-600 hover:underline"
                >
                  전체 해제
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedApis.map((api) => (
                  <span
                    key={api.id}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm text-blue-700 shadow-sm"
                  >
                    {api.name}
                    <button
                      type="button"
                      onClick={() => removeApi(api.id)}
                      className="ml-1 text-blue-400 hover:text-blue-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

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

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">
              가이드 질문을 참고하세요
            </h3>
            <ul className="space-y-1">
              {GUIDE_QUESTIONS.map((q) => (
                <li key={q} className="flex items-start gap-2 text-sm text-gray-500">
                  <span className="mt-0.5 text-blue-400">&#8226;</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => handleApplyTemplate(tmpl)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
              >
                {tmpl.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="만들고 싶은 서비스를 자유롭게 설명해주세요..."
              rows={8}
              className="w-full resize-none rounded-lg border border-gray-300 bg-white p-4 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="absolute bottom-3 right-3 text-xs text-gray-400">
              <span
                className={
                  charCount() < LIMITS.contextMinLength
                    ? 'text-red-500'
                    : 'text-green-600'
                }
              >
                {charCount()}
              </span>
              /{LIMITS.contextMaxLength}
            </div>
          </div>

          {charCount() < LIMITS.contextMinLength && charCount() > 0 && (
            <p className="text-xs text-red-500">
              최소 {LIMITS.contextMinLength}자 이상 입력해주세요. (현재 {charCount()}자)
            </p>
          )}
        </div>
      )}

      {/* Step 3: Generation */}
      {step === 3 && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900">
            서비스 생성
          </h2>

          {genStatus === 'idle' && (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
              <Sparkles className="mx-auto h-12 w-12 text-blue-600" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                준비 완료!
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                선택한 {selectedApis.length}개의 API와 입력한 설명을 바탕으로
                웹서비스를 자동 생성합니다.
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl"
              >
                <Sparkles className="h-4 w-4" />
                생성하기
              </button>
            </div>
          )}

          {genStatus === 'generating' && (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
              <p className="mt-4 text-sm font-medium text-gray-700">
                {genStep || '처리 중...'}
              </p>
              <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-400">{progress}%</p>
            </div>
          )}

          {genStatus === 'completed' && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-green-900">
                생성 완료!
              </h3>
              <p className="mt-2 text-sm text-green-700">
                웹서비스가 성공적으로 생성되었습니다.
              </p>
              <button
                type="button"
                onClick={() => router.push(`/dashboard`)}
                className="mt-6 rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700"
              >
                대시보드에서 확인하기
              </button>
            </div>
          )}

          {genStatus === 'failed' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-red-900">
                생성 실패
              </h3>
              <p className="mt-2 text-sm text-red-700">{genError}</p>
              <button
                type="button"
                onClick={() => {
                  resetGeneration();
                  handleGenerate();
                }}
                className="mt-6 rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700"
              >
                다시 시도
              </button>
            </div>
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
