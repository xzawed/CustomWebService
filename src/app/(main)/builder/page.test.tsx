// @vitest-environment happy-dom
//
// builder 페이지 **특성화 테스트** — 리팩터링 전 회귀 안전망.
//
// 이 파일의 목적은 "현재 동작이 옳다"를 주장하는 게 아니라 **"현재 동작이 이렇다"를 고정**하는
// 것이다. 리팩터링 PR은 이 파일을 **한 줄도 고치지 않고** 전건 통과해야 한다. 한 줄이라도
// 고쳐야 한다면 동작이 바뀐 것이므로 멈추고 원인을 찾을 것 — 테스트를 고쳐 맞추지 말 것.
//
// ⚠️ 단언 규칙: **실 스토어 상태 또는 fetch 호출 사실**만 단언한다.
// `expect(spy).toHaveBeenCalled()`류 자기충족 단언은 쓰지 않는다 — 이 레포는 무단언·의식
// 테스트를 실제로 걷어낸 이력이 있다(E10). 스토어를 모킹하지 않고 **실물을 쓰는** 이유도 같다.
//
// ⚠️ 준비 규칙: `builderModeStore`(`builder-mode`)와 `contextStore`(`builder-context`)는
// **둘 다 persist한다.** 하나만 지우면 테스트 순서에 따라 결과가 달라진다.
//
// 배경: docs/decisions/2026-08-06-long-file-decomposition-scope.md
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { renderComponent, screen, fireEvent, waitFor } from '@/test/helpers/component';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import BuilderPage from './page';
import { useBuilderModeStore } from '@/stores/builderModeStore';
import { useApiSelectionStore } from '@/stores/apiSelectionStore';
import { useContextStore } from '@/stores/contextStore';
import { useGenerationStore } from '@/stores/generationStore';

/** 카탈로그 응답 1건. id는 테스트마다 고유해야 하므로 인자로 받는다. */
function makeApi(id: string, name = `API ${id}`) {
  return {
    id,
    name,
    description: `${name} 설명`,
    category: 'utility',
    baseUrl: `https://example.test/${id}`,
    authType: 'none',
    isActive: true,
    endpoints: [],
  };
}

/**
 * 이 페이지에서 **도달 가능한 모든 엔드포인트**를 덮는다.
 * 하나라도 빠지면 `src/test/setup.ts`의 onUnhandledRequest 단언이 afterEach에서 실패한다
 * (그 단언이 있어서 앱이 `.catch()`로 삼킨 요청도 드러난다 — E7).
 */
function installHandlers(
  overrides: {
    catalog?: ReturnType<typeof makeApi>[];
    categories?: { id: string; name: string }[];
    popular?: unknown[];
  } = {},
) {
  server.use(
    // ⚠️ 응답 형태는 `{ data: { items } }` 다 — 페이지가 `apisData.data?.items ?? []` 로 읽는다
    // (page.tsx:126). `{ data: [...] }` 로 주면 조용히 빈 배열이 되어 **대조군이 실험군과
    // 구분되지 않는다.** 초안에서 실제로 이 함정에 걸렸다.
    http.get('*/api/v1/catalog', () =>
      HttpResponse.json({ data: { items: overrides.catalog ?? [makeApi('a1'), makeApi('a2')] } }),
    ),
    http.get('*/api/v1/catalog/categories', () =>
      HttpResponse.json({ data: overrides.categories ?? [{ id: 'utility', name: '유틸리티' }] }),
    ),
    http.get('*/api/v1/popular-services', () =>
      HttpResponse.json({ data: overrides.popular ?? [] }),
    ),
    http.post('*/api/v1/suggest-context', () => HttpResponse.json({ data: { suggestions: [] } })),
    http.post('*/api/v1/suggest-apis', () => HttpResponse.json({ data: { recommendations: [] } })),
    http.post('*/api/v1/suggest-preferences', () => HttpResponse.json({ data: null })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // persist 스토어 2종을 **둘 다** 비운다. 하나만 지우면 순서 의존이 된다.
  window.localStorage.removeItem('builder-mode');
  window.localStorage.removeItem('builder-context');
  useBuilderModeStore.setState({ mode: 'api-first' });
  useApiSelectionStore.getState().clearApis();
  useContextStore.getState().reset();
  useGenerationStore.getState().reset();
  installHandlers();
});

describe('BuilderPage — 진입 화면', () => {
  it('모드가 확정되기 전에는 모드 선택 화면만 렌더한다', () => {
    renderComponent(<BuilderPage />);

    expect(screen.getByText('어떤 방식으로 시작하시겠어요?')).toBeTruthy();
    expect(screen.getByText('API를 직접 선택')).toBeTruthy();
    expect(screen.getByText('아이디어로 시작')).toBeTruthy();
    // 빌더 본문(단계 표시기)은 아직 없다
    expect(screen.queryByText('사용할 API를 선택하세요')).toBeNull();
  });

  // 현행 동작 고정: 카탈로그는 **모드 선택 전, 마운트 시점에** 이미 나간다.
  // `if (!modeConfirmed) return …` 조기 반환은 렌더 단계이고 `useEffect(deps: [])`는
  // 그보다 먼저 걸리므로, 사용자가 모드를 고르는 동안 프리페치가 일어난다.
  // (의도된 프리페치인지 부작용인지는 이 테스트가 판단하지 않는다 — 사실만 고정한다.)
  it('카탈로그는 모드 선택 전 마운트 시점에 이미 요청된다 (프리페치)', async () => {
    let catalogHits = 0;
    server.use(
      http.get('*/api/v1/catalog', () => {
        catalogHits += 1;
        return HttpResponse.json({ data: [] });
      }),
    );

    renderComponent(<BuilderPage />);
    await waitFor(() => expect(screen.getByText('API를 직접 선택')).toBeTruthy());

    await waitFor(() => expect(catalogHits).toBe(1));
  });
});

describe('BuilderPage — 모드 선택과 리셋', () => {
  it('api-first 선택 시 스토어에 모드가 기록되고 1단계 본문이 나타난다', async () => {
    renderComponent(<BuilderPage />);

    fireEvent.click(screen.getByText('API를 직접 선택').closest('button')!);

    await waitFor(() => expect(screen.getByText('사용할 API를 선택하세요')).toBeTruthy());
    expect(useBuilderModeStore.getState().mode).toBe('api-first');
  });

  it('context-first 선택 시 스토어에 모드가 기록된다', async () => {
    renderComponent(<BuilderPage />);

    fireEvent.click(screen.getByText('아이디어로 시작').closest('button')!);

    await waitFor(() => expect(useBuilderModeStore.getState().mode).toBe('context-first'));
    // 모드 선택 화면을 벗어났다
    expect(screen.queryByText('어떤 방식으로 시작하시겠어요?')).toBeNull();
  });

  it('모드 선택은 이전 API 선택과 컨텍스트를 지운다 (팬아웃 리셋)', async () => {
    useApiSelectionStore.getState().addApi(makeApi('stale') as never);
    useContextStore.getState().setContext('이전 세션에서 남은 컨텍스트입니다');
    expect(useApiSelectionStore.getState().selectedApis).toHaveLength(1);

    renderComponent(<BuilderPage />);
    fireEvent.click(screen.getByText('아이디어로 시작').closest('button')!);

    await waitFor(() => {
      expect(useApiSelectionStore.getState().selectedApis).toHaveLength(0);
      expect(useContextStore.getState().context).toBe('');
    });
  });
});

describe('BuilderPage — 카탈로그 로드', () => {
  // 마운트 1회로 끝난다 — 모드를 고른다고 다시 부르지 않는다.
  // 이 단언이 깨지면 리팩터가 이펙트 deps를 바꿔 중복 요청을 만든 것이다.
  it('카탈로그와 카테고리는 각각 정확히 1회만 요청된다 (모드 선택이 재요청을 만들지 않는다)', async () => {
    let catalogHits = 0;
    let categoryHits = 0;
    server.use(
      http.get('*/api/v1/catalog/categories', () => {
        categoryHits += 1;
        return HttpResponse.json({ data: [{ id: 'utility', name: '유틸리티' }] });
      }),
      http.get('*/api/v1/catalog', () => {
        catalogHits += 1;
        return HttpResponse.json({ data: [makeApi('a1')] });
      }),
    );

    renderComponent(<BuilderPage />);
    fireEvent.click(screen.getByText('API를 직접 선택').closest('button')!);

    await waitFor(() => {
      expect(catalogHits).toBe(1);
      expect(categoryHits).toBe(1);
    });
  });

  it('카탈로그 요청이 실패해도 화면이 죽지 않는다 — 1단계는 계속 렌더된다', async () => {
    server.use(
      http.get('*/api/v1/catalog', () => HttpResponse.error()),
      http.get('*/api/v1/catalog/categories', () => HttpResponse.error()),
    );

    renderComponent(<BuilderPage />);
    fireEvent.click(screen.getByText('API를 직접 선택').closest('button')!);

    await waitFor(() => expect(screen.getByText('사용할 API를 선택하세요')).toBeTruthy());
  });
});

// ════════════════════════════════════════════════════════════════════════════
// KNOWN-DEFECT — 아래 단언들은 **현재 동작이 잘못됐음을 고정**한다.
//
// 리팩터링 PR은 이 단언들도 그대로 통과해야 한다(동작을 바꾸지 않았다는 증명).
// **결함을 고치는 PR만이 이 단언을 뒤집을 수 있고**, 그때는 뒤집힌 단언이
// 곧 수정의 증거가 된다. 그 외의 이유로 이 블록을 고치지 말 것.
//
// 근거: docs/superpowers/plans/2026-07-31-project-wbs.md 의 F20
// ════════════════════════════════════════════════════════════════════════════

const LONG_CONTEXT = '실시간 날씨와 미세먼지를 한 화면에서 보여주는 대시보드를 만들고 싶습니다. 지역을 선택하면 해당 지역 정보가 표시되면 좋겠습니다.';

function popularService(apiIds: string[]) {
  return {
    id: 'ps1',
    title: '날씨 대시보드',
    description: '날씨와 미세먼지',
    context: LONG_CONTEXT,
    apiNames: ['Weather API'],
    apiIds,
    category: 'utility',
    usageCount: 42,
  };
}

/** context-first 모드로 진입해 step 1까지 간다. */
async function enterContextFirst() {
  renderComponent(<BuilderPage />);
  fireEvent.click(screen.getByText('아이디어로 시작').closest('button')!);
  await waitFor(() => expect(screen.getByText('어떤 서비스를 만들고 싶으세요?')).toBeTruthy());
}

describe('KNOWN-DEFECT: 인기 서비스 선택이 카탈로그 미로드 시 데드엔드를 만든다', () => {
  it('대조군 — 카탈로그가 로드돼 있으면 인기 서비스 선택이 API를 실제로 채운다', async () => {
    installHandlers({
      catalog: [makeApi('a1', 'Weather API')],
      popular: [popularService(['a1'])],
    });
    server.use(
      http.get('*/api/v1/popular-services', () =>
        HttpResponse.json({ data: { services: [popularService(['a1'])] } }),
      ),
    );

    await enterContextFirst();
    await waitFor(() => expect(screen.getByText('날씨 대시보드')).toBeTruthy());
    fireEvent.click(screen.getByText('날씨 대시보드').closest('button')!);

    await waitFor(() => {
      expect(useContextStore.getState().context).toBe(LONG_CONTEXT);
      expect(useApiSelectionStore.getState().selectedApis).toHaveLength(1);
    });
  });

  it('KNOWN-DEFECT — 카탈로그가 비어 있으면 컨텍스트만 채우고 API를 조용히 버린다', async () => {
    // 카탈로그 응답이 비어 있는 상황(로드 실패·지연·limit 캡으로 잘림)을 재현한다.
    installHandlers({ catalog: [] });
    server.use(
      http.get('*/api/v1/popular-services', () =>
        HttpResponse.json({ data: { services: [popularService(['a1'])] } }),
      ),
    );

    await enterContextFirst();
    await waitFor(() => expect(screen.getByText('날씨 대시보드')).toBeTruthy());
    fireEvent.click(screen.getByText('날씨 대시보드').closest('button')!);

    await waitFor(() => expect(useContextStore.getState().context).toBe(LONG_CONTEXT));
    // ⛔ 여기가 결함이다 — 컨텍스트는 들어갔는데 API는 하나도 안 들어갔다.
    // `apis.find()`가 전부 undefined를 반환하는데 `clearApis()`는 이미 실행된 뒤다.
    expect(useApiSelectionStore.getState().selectedApis).toHaveLength(0);
  });

  it('KNOWN-DEFECT — 그 상태에서 「다음」을 눌러도 추천을 재조회하지 않는다 (데드엔드)', async () => {
    let suggestApiHits = 0;
    installHandlers({ catalog: [] });
    server.use(
      http.get('*/api/v1/popular-services', () =>
        HttpResponse.json({ data: { services: [popularService(['a1'])] } }),
      ),
      http.post('*/api/v1/suggest-apis', () => {
        suggestApiHits += 1;
        return HttpResponse.json({ data: { recommendations: [] } });
      }),
    );

    await enterContextFirst();
    await waitFor(() => expect(screen.getByText('날씨 대시보드')).toBeTruthy());
    fireEvent.click(screen.getByText('날씨 대시보드').closest('button')!);
    await waitFor(() => expect(useContextStore.getState().context).toBe(LONG_CONTEXT));

    fireEvent.click(screen.getByText('다음').closest('button')!);

    // ⛔ 결함의 핵심 — `handleSelectPopularService`가 `lastRecommendedContext`를
    // `context`와 **같은 값**으로 설정해 두었기 때문에, `handleNextStep`의
    // `context !== lastRecommendedContext` 가드가 거짓이 되어 재조회가 막힌다.
    // 사용자는 API 0개인 채로 2단계에 도착하고 빠져나갈 방법이 없다.
    await waitFor(() => expect(screen.getByText('추천된 API를 확인하세요')).toBeTruthy());
    expect(suggestApiHits).toBe(0);
    expect(useApiSelectionStore.getState().selectedApis).toHaveLength(0);
  });
});

describe('KNOWN-DEFECT: 늦게 도착한 추천 응답이 사용자 선택을 덮어쓴다', () => {
  /** 응답을 테스트가 원하는 시점에 해소할 수 있게 만드는 지연 게이트. */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  // 시나리오를 "세션 간 오염"으로 잡은 이유:
  // "비행 중 수동 선택이 지워진다"는 **의도된 동작일 수 있다**(추천이 도착하면 자동 선택이
  // 대체하는 게 설계일 수 있음). 반면 **방식을 바꿔 새 세션을 시작했는데 이전 세션의 추천이
  // 흘러드는 것**은 어떤 해석으로도 옳지 않다. 모호하지 않은 쪽을 고정한다.
  it('KNOWN-DEFECT — 방식 변경 후에도 이전 세션의 늦은 추천이 새 세션을 오염시킨다', async () => {
    const gate = deferred<void>();
    const leaked = makeApi('leaked', '이전 세션 추천 API');
    installHandlers({ catalog: [makeApi('a1'), leaked] });
    server.use(
      http.post('*/api/v1/suggest-apis', async () => {
        await gate.promise; // 테스트가 열어줄 때까지 비행 상태로 붙잡는다
        return HttpResponse.json({
          data: { recommendations: [{ api: leaked, reason: '이전 세션에서 추천됨' }] },
        });
      }),
    );

    await enterContextFirst();
    // 컨텍스트를 유효 길이(LIMITS.contextMinLength=50)로 채워 「다음」을 활성화한다
    useContextStore.getState().setContext(LONG_CONTEXT);
    await waitFor(() => expect(useContextStore.getState().isValid()).toBe(true));

    fireEvent.click(screen.getByText('다음').closest('button')!);
    await waitFor(() => expect(screen.getByText('추천된 API를 확인하세요')).toBeTruthy());

    // 요청이 비행 중인 사이 사용자가 **방식을 바꾼다** → handleResetMode 가 전부 비운다.
    fireEvent.click(screen.getByText('방식 변경').closest('button')!);
    await waitFor(() => expect(screen.getByText('어떤 방식으로 시작하시겠어요?')).toBeTruthy());
    expect(useApiSelectionStore.getState().selectedApis).toHaveLength(0);

    // 새 세션을 시작한다 — handleModeSelect 가 한 번 더 비운다.
    fireEvent.click(screen.getByText('API를 직접 선택').closest('button')!);
    await waitFor(() => expect(screen.getByText('사용할 API를 선택하세요')).toBeTruthy());
    expect(useApiSelectionStore.getState().selectedApis).toHaveLength(0);

    // 이제 **이전 세션의** 늦은 응답이 도착한다.
    gate.resolve();

    // ⛔ 결함 — `fetchApiRecommendations`(295-323)에 AbortController가 없다.
    // (이 페이지에서 AbortController는 113행 카탈로그·217행 preferences 둘뿐이다.)
    // 그래서 방식 변경으로 취소돼야 할 요청이 살아남아, 312행 `clearApis()` 후
    // **이전 컨텍스트의 추천이 새 세션에 주입된다.**
    await waitFor(() => {
      const selected = useApiSelectionStore.getState().selectedApis;
      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe('leaked');
    });
  });
});
