// @vitest-environment happy-dom
//
// regen 버전 정체 회귀 — page.test.tsx 와 분리한다.
// 이 파일은 next/dynamic · runClientGeneration · runClientRegeneration 모킹이 필요해서
// page.test.tsx 의 "한 줄도 고치지 말 것" 계약을 위반하지 않도록 별도 파일로 둔다.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import React from 'react';
import { server } from '@/test/mocks/server';
import { renderComponent, screen, fireEvent, waitFor, act } from '@/test/helpers/component';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  nextProject: { id: 'proj-A', version: 3 } as { id: string; version: number },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

// PreviewFrame 은 next/dynamic 으로 로드된다 — 테스트에서 실제 컴포넌트가 뜨도록 lazy+Suspense.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>) => {
    const Lazy = React.lazy(loader);
    return function DynamicComponent(props: Record<string, unknown>) {
      return (
        <React.Suspense fallback={null}>
          <Lazy {...props} />
        </React.Suspense>
      );
    };
  },
}));

vi.mock('@/lib/generation/runClientRegeneration', () => ({
  runClientRegeneration: async (
    _input: unknown,
    deps: { completeRegeneration: (version: number | undefined) => void },
  ) => {
    deps.completeRegeneration(4);
  },
}));

vi.mock('@/lib/generation/runClientGeneration', () => ({
  runClientGeneration: async (
    _input: unknown,
    deps: {
      startGeneration: () => string;
      setGeneratingProjectId: (id: string) => void;
      completeGeneration: (
        projectId: string,
        version: number | undefined,
        runId: string,
      ) => void;
      onCompleted?: () => void;
    },
  ) => {
    const p = mocks.nextProject;
    const runId = deps.startGeneration();
    deps.setGeneratingProjectId(p.id);
    deps.completeGeneration(p.id, p.version, runId);
    deps.onCompleted?.();
  },
}));

import BuilderPage from './page';
import { useBuilderModeStore } from '@/stores/builderModeStore';
import { useApiSelectionStore } from '@/stores/apiSelectionStore';
import { useContextStore } from '@/stores/contextStore';
import { useGenerationStore } from '@/stores/generationStore';

const LONG_CONTEXT =
  '실시간 날씨와 미세먼지를 한 화면에서 보여주는 대시보드를 만들고 싶습니다. 지역을 선택하면 해당 지역 정보가 표시되면 좋겠습니다.';

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

function installHandlers(
  overrides: {
    catalog?: ReturnType<typeof makeApi>[];
    categories?: { id: string; name: string }[];
    popular?: unknown[];
  } = {},
) {
  server.use(
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
  mocks.nextProject = { id: 'proj-A', version: 3 };
  window.localStorage.removeItem('builder-mode');
  window.localStorage.removeItem('builder-context');
  useBuilderModeStore.setState({ mode: 'api-first' });
  useApiSelectionStore.getState().clearApis();
  useContextStore.getState().reset();
  useGenerationStore.getState().reset();
  installHandlers();
});

describe('BuilderPage — regen version 은 projectId 와 함께 묶인다', () => {
  it('이전 프로젝트의 regen version 이 새 프로젝트 미리보기에 남지 않는다', async () => {
    installHandlers({ catalog: [makeApi('a1')] });

    renderComponent(<BuilderPage />);
    fireEvent.click(screen.getByText('API를 직접 선택').closest('button')!);
    await waitFor(() => expect(screen.getByText('사용할 API를 선택하세요')).toBeTruthy());

    await act(async () => {
      useApiSelectionStore.getState().addApi(makeApi('a1') as never);
      useContextStore.getState().setContext(LONG_CONTEXT);
    });

    // step 1 → 2 → 3
    fireEvent.click(screen.getByText('다음').closest('button')!);
    await waitFor(() => expect(screen.getByText('어떤 서비스를 만들고 싶으세요?')).toBeTruthy());
    fireEvent.click(screen.getByText('다음').closest('button')!);
    await waitFor(() => expect(screen.getByText('서비스 생성')).toBeTruthy());

    // step 3 에 「생성하기」가 두 개(GenerationProgress + 하단 네비) — 첫 번째 클릭
    fireEvent.click(screen.getAllByText('생성하기')[0]!);

    await waitFor(() => {
      expect(useGenerationStore.getState().status).toBe('completed');
      expect(useGenerationStore.getState().projectId).toBe('proj-A');
    });

    // PreviewFrame iframe 이 로드될 때까지
    const iframe = await waitFor(() => {
      const el = document.querySelector('iframe');
      expect(el).toBeTruthy();
      return el as HTMLIFrameElement;
    });
    expect(iframe.getAttribute('src')).toContain('/api/v1/preview/proj-A');

    // 대조군 — 재생성 버전이 미리보기에 실제로 반영된다
    fireEvent.click(screen.getByText('프롬프트로 수정하기').closest('button')!);
    const textarea = await waitFor(() =>
      screen.getByPlaceholderText(/차트를 막대 그래프/i),
    );
    fireEvent.change(textarea, {
      target: { value: '차트를 막대 그래프로 변경해주세요' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('수정 생성').closest('button')!);
    });

    await waitFor(() => expect(iframe.getAttribute('src')).toContain('version=4'));

    // 새 프로젝트 생성 — 이전 regen version=4 가 따라오면 안 된다
    mocks.nextProject = { id: 'proj-B', version: 1 };
    fireEvent.click(screen.getByText('새로 생성하기').closest('button')!);
    await waitFor(() => expect(useGenerationStore.getState().status).toBe('idle'));

    fireEvent.click(screen.getAllByText('생성하기')[0]!);
    await waitFor(() => {
      expect(useGenerationStore.getState().status).toBe('completed');
      expect(useGenerationStore.getState().projectId).toBe('proj-B');
    });

    const iframeB = await waitFor(() => {
      const el = document.querySelector('iframe');
      expect(el).toBeTruthy();
      expect(el!.getAttribute('src')).toContain('/api/v1/preview/proj-B');
      return el as HTMLIFrameElement;
    });
    const src = iframeB.getAttribute('src') ?? '';
    expect(src).toContain('/api/v1/preview/proj-B');
    expect(src).not.toContain('version=4');
  });
});
