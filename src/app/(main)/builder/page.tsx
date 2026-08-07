'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
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
import RelevanceGate from '@/components/builder/RelevanceGate';
import type { Template } from '@/components/builder/TemplateSelector';
import GenerationProgress from '@/components/builder/GenerationProgress';
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
import { abortGenerationSession } from '@/lib/generation/generationSession';
import { runClientGeneration } from '@/lib/generation/runClientGeneration';
import type { ApiCatalogItem, Category } from '@/types/api';
import type { RelevanceGateResult } from '@/types/project';
import { ChevronLeft, ChevronRight, Sparkles, Loader2, RefreshCw } from 'lucide-react';

const PreviewFrame = dynamic(() => import('@/components/builder/PreviewFrame'), {
  ssr: false,
  loading: () => null,
});

const STEPS_API_FIRST = [{ label: 'API 선택' }, { label: '서비스 설명' }, { label: '생성' }];
const STEPS_CONTEXT_FIRST = [{ label: '서비스 설명' }, { label: 'API 매칭' }, { label: '생성' }];

export default function BuilderPage() {
  const router = useRouter();
  const [modeConfirmed, setModeConfirmed] = useState(false);
  const [step, setStep] = useState(1);
  const [apis, setApis] = useState<ApiCatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  /**
   * 재생성 결과 버전은 **그 버전이 속한 프로젝트와 한 쌍으로만** 의미가 있다.
   *
   * `number` 하나로 들면 「새로 생성하기」→「생성하기」로 만든 **다음 프로젝트에도 살아남아**
   * 미리보기가 존재하지 않는 버전을 요구한다. preview 라우트는 최신본 폴백을 하지 않고
   * `NotFoundError`(404)를 던지며, 그 본문은 `application/json`이라 iframe에 **원본 JSON
   * 에러 텍스트가 그대로 보인다**(실측).
   *
   * 신원을 값 안에 담으면 `setRegen(null)`을 **어디서도 부를 필요가 없다** — 즉 리셋 누락이
   * 버그가 될 수 없다. 이전 구현은 `setRegenVersion(undefined)` 호출이 저장소 전체에 0건이었다.
   */
  const [regen, setRegen] = useState<{ projectId: string; version: number } | null>(null);

  /**
   * 비행 중인 AI 제안 요청(suggest-context · suggest-apis)의 취소 핸들.
   *
   * 둘은 모드별로 배타적이라(api-first는 suggest-context, context-first는 suggest-apis)
   * ref 하나를 공유한다. 방식 변경·모드 선택은 이걸 abort해서 **이전 세션의 늦은 응답이
   * 새 세션에 주입되는 것**을 막는다. 없으면 `fetchApiRecommendations`의 `clearApis()`가
   * 새 세션 선택을 지우고 이전 컨텍스트의 추천을 채워 넣는다.
   */
  const aiRequestAbortRef = useRef<AbortController | null>(null);

  /**
   * 로딩 플래그 **소유권 토큰**.
   *
   * 해제 조건은 "내 요청이 취소됐나"가 아니라 **"내가 아직 이 플래그의 최신 소유자인가"**다.
   * `signal.aborted`는 (a) 후속 요청의 선점과 (b) 리셋·이펙트 정리에 의한 폐기를 구분하지
   * 못하는데, (a)에서는 선점자가 이미 true를 다시 썼으니 내가 끄면 안 되고 (b)에서는
   * 후속자가 없으니 **반드시 내가 꺼야 한다**. 한 비트로 두 질문에 답하려던 것이 결함이었다.
   *
   * 요점: 리셋 핸들러(`handleModeSelect`·`handleResetMode`)와 이펙트 조기반환 분기는
   * **로딩 플래그의 존재를 알 필요가 없다.** 새 abort 지점이 생겨도 자동으로 옳다.
   * (abort 지점마다 해제 코드를 추가하는 방식은 그 곱셈을 절반만 채우다 #289에서 재도입됐다.)
   *
   * ⚠️ 불변조건: `++xxxReqIdRef.current` 와 대응하는 `finally` 를 가진 `try` 사이에
   * **`await` 도 조기 `return` 도 넣지 말 것.** 동기 `setState` 는 끼어도 된다
   * (실제로 suggestions·recommendations 는 초기화 2줄이 사이에 있다 — 그건 괜찮다).
   * 어기면 "true 를 쓴 실행에는 반드시 대응하는 finally 가 있다"가 깨져 고착이 돌아온다.
   *
   * ⚠️ **이 배치 규칙은 어떤 테스트도 지키지 않는다.** `page.test.tsx` 의 선점 음성대조는
   * **토큰 비교**(이전 요청의 finally 가 최신 로딩을 끄면 안 된다)를 지킬 뿐, 증가와 `try`
   * 사이에 조기 return 을 끼워 넣는 변경은 **통과시킨다**. 즉 여기는 리뷰로만 지켜진다 —
   * "테스트가 막아준다"고 믿지 말 것.
   */
  const suggestionsReqIdRef = useRef(0);
  const recommendationsReqIdRef = useRef(0);
  const preferenceReqIdRef = useRef(0);

  // Context suggestion state (for api-first mode)
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);

  // API recommendation state (for context-first mode)
  const [apiRecommendations, setApiRecommendations] = useState<ApiRecommendation[]>([]);
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState(false);
  const [lastRecommendedContext, setLastRecommendedContext] = useState<string | null>(null);

  // Relevance Gate state
  const [isPreferenceLoading, setIsPreferenceLoading] = useState(false);

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
    aiSuggestion,
    relevanceScore,
    gateResolved,
    resolutionOptions,
    setAiSuggestion,
    setRelevanceScore,
    setSuggestionSource,
    setResolutionOptions,
    markGateResolved,
    clearSuggestion,
    setMood,
    setAudience,
    setLayoutPreference,
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
  const selectedIds = useMemo(() => selectedApis.map((a) => a.id), [selectedApis]);

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
    return () => {
      abortCtrl.abort();
      // 언마운트 시 비행 중인 AI 제안 요청도 끊는다 — 사라진 화면에 상태를 쓰지 않는다.
      aiRequestAbortRef.current?.abort();
    };
  }, []);

  // === Mode selection from big cards ===
  const handleModeSelect = useCallback(
    (selectedMode: BuilderMode) => {
      // 이전 세션의 AI 요청이 살아 있으면 새 세션을 오염시킨다 — 먼저 끊는다.
      aiRequestAbortRef.current?.abort();
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
    // 비행 중인 AI 제안 요청을 끊는다. 안 끊으면 늦은 응답의 clearApis()가
    // 새 세션 선택을 지우고 이전 컨텍스트의 추천을 주입한다.
    aiRequestAbortRef.current?.abort();
    // 고아 폴러 네트워크를 즉시 끊는다. 스토어 오염 1차 방어는 runId(E8).
    abortGenerationSession();
    resetGeneration();
    setSuggestions([]);
    setApiRecommendations([]);
    setRecommendationsError(false);
    setLastRecommendedContext(null);
    setActiveSuggestionIndex(null);
  }, [clearApis, resetContext, resetGeneration]);

  const handleGenerate = useCallback(async () => {
    await runClientGeneration(
      {
        context,
        apiIds: selectedIds,
        designPreferences: getDesignPreferences(),
        templateId: selectedTemplate,
      },
      {
        startGeneration,
        updateProgress,
        completeGeneration,
        failGeneration,
        setGeneratingProjectId,
        onCompleted: () => {
          resetContext();
          clearApis();
        },
      },
    );
  }, [
    selectedIds,
    context,
    selectedTemplate,
    getDesignPreferences,
    startGeneration,
    updateProgress,
    completeGeneration,
    failGeneration,
    resetContext,
    clearApis,
    setGeneratingProjectId,
  ]);

  // === Relevance Gate: preference recommendation trigger ===
  useEffect(() => {
    if (context.length < 20 || selectedIds.length === 0) {
      clearSuggestion();
      return;
    }

    const abortCtrl = new AbortController();
    const timer = setTimeout(async () => {
      const reqId = ++preferenceReqIdRef.current;
      setIsPreferenceLoading(true);
      try {
        const res = await fetch('/api/v1/suggest-preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context, apiIds: selectedIds }),
          signal: abortCtrl.signal,
        });
        if (!res.ok) return;
        const { data } = (await res.json()) as { data: RelevanceGateResult };
        if (!data) return;

        setRelevanceScore(data.relevanceScore);
        if (data.suggestion) setAiSuggestion(data.suggestion);
        if (data.resolutionOptions) setResolutionOptions(data.resolutionOptions);

        if (data.relevanceScore !== null && data.relevanceScore >= 70) {
          if (data.suggestion) {
            if (data.suggestion.mood !== 'auto') setMood(data.suggestion.mood);
            if (data.suggestion.audience !== 'general') setAudience(data.suggestion.audience);
            if (data.suggestion.layoutPreference !== 'auto')
              setLayoutPreference(data.suggestion.layoutPreference);
            setSuggestionSource('ai');
          }
          markGateResolved();
        }
      } catch (err) {
        if ((err as { name?: string }).name !== 'AbortError') {
          // 폴백: 현재 UX 유지
        }
      } finally {
        if (preferenceReqIdRef.current === reqId) setIsPreferenceLoading(false);
      }
    }, 600);

    return () => {
      clearTimeout(timer);
      abortCtrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, selectedIds.join(',')]);

  // === API-first mode: fetch context suggestions ===
  const fetchSuggestions = useCallback(async () => {
    if (selectedApis.length === 0) return;

    // 추천과 같은 이유로 취소 가능해야 한다 — 방식을 바꾸면 이전 세션의 제안이
    // 새 세션 화면에 뜨면 안 된다. 두 요청은 서로 배타적이라 ref 하나를 공유한다.
    aiRequestAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    aiRequestAbortRef.current = abortCtrl;

    const reqId = ++suggestionsReqIdRef.current;
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
        signal: abortCtrl.signal,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error('[suggest-context]', res.status, errBody?.error?.message ?? 'Unknown error');
        throw new Error(errBody?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (abortCtrl.signal.aborted) return;
      setSuggestions(data.data?.suggestions ?? []);
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      console.error('[suggest-context] failed:', err instanceof Error ? err.message : err);
      setSuggestions([]);
    } finally {
      if (suggestionsReqIdRef.current === reqId) {
        setIsSuggestionsLoading(false);
      }
    }
  }, [selectedApis]);

  // === Context-first mode: fetch API recommendations ===
  const fetchApiRecommendations = useCallback(async () => {
    if (!context || context.length < LIMITS.contextMinLength) return;

    // 이전 요청을 취소하고 이번 요청을 현재 것으로 등록한다.
    // 없으면 방식 변경으로 세션을 새로 시작해도 **이전 컨텍스트의 추천이 살아남아**
    // 아래 clearApis() 이후 새 세션에 주입된다(세션 간 오염).
    aiRequestAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    aiRequestAbortRef.current = abortCtrl;

    const reqId = ++recommendationsReqIdRef.current;
    setIsRecommendationsLoading(true);
    setApiRecommendations([]);
    setRecommendationsError(false);
    try {
      const res = await fetch('/api/v1/suggest-apis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
        signal: abortCtrl.signal,
      });
      if (!res.ok) throw new Error('Failed to fetch API recommendations');
      const data = await res.json();
      // 응답 파싱 사이에 취소됐을 수 있다 — 쓰기 직전에 한 번 더 본다.
      if (abortCtrl.signal.aborted) return;
      const recs: ApiRecommendation[] = data.data?.recommendations ?? [];
      setApiRecommendations(recs);
      setLastRecommendedContext(context);
      // Auto-select all recommended APIs
      clearApis();
      for (const rec of recs) {
        addApi(rec.api);
      }
    } catch (err) {
      // 취소는 실패가 아니다 — 에러 UI를 띄우거나 상태를 되돌리지 않는다.
      if ((err as { name?: string }).name === 'AbortError') return;
      setApiRecommendations([]);
      setRecommendationsError(true);
      setLastRecommendedContext(null);
    } finally {
      if (recommendationsReqIdRef.current === reqId) {
        setIsRecommendationsLoading(false);
      }
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

  // === Relevance Gate handlers ===
  const handleGateSelectContext = useCallback(
    (ctx: string) => {
      setContext(ctx);
      clearSuggestion();
    },
    [setContext, clearSuggestion]
  );

  const handleGateSelectApiCategory = useCallback(
    (category: string) => {
      router.push(`/catalog?category=${encodeURIComponent(category)}`);
    },
    [router]
  );

  const handleGateSelectCreativeMerge = useCallback(
    (merge: string) => {
      setContext(merge);
      markGateResolved();
    },
    [setContext, markGateResolved]
  );

  const handleGateSkip = useCallback(() => {
    markGateResolved();
  }, [markGateResolved]);

  // === Context-first mode: select popular service ===
  const handleSelectPopularService = useCallback(
    (service: PopularService) => {
      setContext(service.context);

      // 카탈로그에서 **실제로 해석된** API만 센다. 카탈로그가 아직 안 왔거나
      // 로드에 실패했으면 여기가 빈 배열이 된다.
      const resolved = service.apiIds
        .map((apiId) => apis.find((a) => a.id === apiId))
        .filter((api): api is ApiCatalogItem => api !== undefined);

      // ⚠️ 해석된 게 하나도 없으면 **아무것도 건드리지 않는다.**
      // 예전에는 `service.apiIds.length > 0`만 보고 진행해서, 카탈로그가 비어 있으면
      // clearApis()로 선택만 지우고 API는 하나도 못 넣은 채 `lastRecommendedContext`를
      // 설정했다. 그러면 handleNextStep의 `context !== lastRecommendedContext` 가드가
      // 거짓이 되어 추천 재조회까지 막혀 **2단계에서 빠져나갈 수 없었다**(데드엔드).
      // 지금은 컨텍스트만 채우고 빠지므로, 「다음」에서 정상적으로 추천을 조회한다.
      if (resolved.length === 0) return;

      clearApis();
      for (const api of resolved) addApi(api);
      setApiRecommendations(
        resolved.map((api) => ({ api, reason: '인기 서비스 추천 API' }))
      );
      setLastRecommendedContext(service.context);
      setRecommendationsError(false);
    },
    [setContext, clearApis, addApi, apis]
  );

  // === Determine navigation validity ===
  const canProceedStep1 =
    mode === 'api-first' ? selectedApis.length > 0 : isContextValid();
  const canProceedStep2 =
    mode === 'api-first' ? isContextValid() : selectedApis.length > 0;

  const relevanceGateNode =
    relevanceScore !== null && relevanceScore < 70 && !gateResolved && aiSuggestion && resolutionOptions ? (
      <RelevanceGate
        relevanceScore={relevanceScore}
        reason={aiSuggestion.reason}
        resolutionOptions={resolutionOptions}
        onSelectContext={handleGateSelectContext}
        onSelectApiCategory={handleGateSelectApiCategory}
        onSelectCreativeMerge={handleGateSelectCreativeMerge}
        onSkip={handleGateSkip}
      />
    ) : null;

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
        disabled={step === 3 && genStatus === 'generating'}
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
              {relevanceGateNode}
              <TemplateSelector
                onSelect={handleApplyTemplate}
                aiSuggestedId={aiSuggestion?.template}
                isLoadingAi={isPreferenceLoading}
              />
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
                <PreviewFrame
                  projectId={projectId}
                  version={
                    regen !== null && regen.projectId === projectId
                      ? regen.version
                      : (version ?? undefined)
                  }
                />
              )}
              {genStatus === 'completed' && projectId && (
                <RePromptPanel
                  projectId={projectId}
                  onRegenerationComplete={(v) => setRegen({ projectId, version: v })}
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
              {relevanceGateNode}
              <TemplateSelector
                onSelect={handleApplyTemplate}
                aiSuggestedId={aiSuggestion?.template}
                isLoadingAi={isPreferenceLoading}
              />
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
                <PreviewFrame
                  projectId={projectId}
                  version={
                    regen !== null && regen.projectId === projectId
                      ? regen.version
                      : (version ?? undefined)
                  }
                />
              )}
              {genStatus === 'completed' && projectId && (
                <RePromptPanel
                  projectId={projectId}
                  onRegenerationComplete={(v) => setRegen({ projectId, version: v })}
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

        {step === 3 && genStatus === 'completed' && (
          <button
            type="button"
            onClick={resetGeneration}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            새로 생성하기
          </button>
        )}
      </div>
    </div>
  );
}
