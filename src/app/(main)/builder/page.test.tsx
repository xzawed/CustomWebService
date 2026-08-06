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
    http.get('*/api/v1/catalog', () =>
      HttpResponse.json({ data: overrides.catalog ?? [makeApi('a1'), makeApi('a2')] }),
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
