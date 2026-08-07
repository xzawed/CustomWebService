// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import RePromptPanel from './RePromptPanel';
import { abortRegenerationSession } from '@/lib/generation/regenerationSession';

const runClientRegeneration = vi.fn();

vi.mock('@/lib/generation/runClientRegeneration', () => ({
  runClientRegeneration: (...args: unknown[]) => runClientRegeneration(...args),
}));

vi.mock('@/lib/generation/regenerationSession', async () => {
  const actual = await vi.importActual<typeof import('@/lib/generation/regenerationSession')>(
    '@/lib/generation/regenerationSession',
  );
  return {
    ...actual,
    abortRegenerationSession: vi.fn(actual.abortRegenerationSession),
  };
});

function openPanel(): void {
  fireEvent.click(screen.getByRole('button', { name: /프롬프트로 수정하기/i }));
}

describe('RePromptPanel', () => {
  const onRegenerationComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    runClientRegeneration.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('재생성 제출 → runClientRegeneration 호출 + complete 시 onRegenerationComplete', async () => {
    runClientRegeneration.mockImplementation(async (_input, deps) => {
      deps.updateProgress(50, '수정 중');
      deps.completeRegeneration(3);
    });

    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();

    const textarea = screen.getByPlaceholderText(/차트를 막대 그래프/i);
    fireEvent.change(textarea, {
      target: { value: '차트를 막대 그래프로 변경해주세요' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /수정 생성/i }));
    });

    await waitFor(() => {
      expect(runClientRegeneration).toHaveBeenCalledTimes(1);
    });
    expect(runClientRegeneration.mock.calls[0][0]).toEqual({
      projectId: 'proj-1',
      feedback: '차트를 막대 그래프로 변경해주세요',
    });
    expect(onRegenerationComplete).toHaveBeenCalledWith(3);
    expect(screen.getByText('수정이 완료되었습니다!')).toBeTruthy();
  });

  it('빈 피드백 + suggestions 존재 시 기본 피드백으로 재생성한다', async () => {
    // suggestions.length > 0 이면 short 가드 스킵 → 기본 문구 사용
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { suggestions: ['색상을 더 밝게 바꿔주세요'] },
        }),
      }),
    );

    runClientRegeneration.mockImplementation(async (_input, deps) => {
      deps.completeRegeneration(1);
    });

    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI 추천 받기/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('색상을 더 밝게 바꿔주세요')).toBeTruthy();
    });

    // 피드백 비운 채 수정 생성 → 기본 문구
    fireEvent.change(screen.getByPlaceholderText(/차트를 막대 그래프/i), {
      target: { value: '' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /수정 생성/i }));
    });

    await waitFor(() => {
      expect(runClientRegeneration).toHaveBeenCalledWith(
        {
          projectId: 'proj-1',
          feedback: '현재 웹서비스를 개선해주세요.',
        },
        expect.any(Object),
      );
    });
  });

  it('짧은 피드백 + suggestions 없음 → 추천 API 호출, regenerate 미호출', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { suggestions: ['차트 색상을 변경', '필터 추가'] },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();

    fireEvent.change(screen.getByPlaceholderText(/차트를 막대 그래프/i), {
      target: { value: '짧게' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /수정 생성/i }));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/suggest-modification',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(runClientRegeneration).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('차트 색상을 변경')).toBeTruthy();
    });
  });

  it('추천 클릭 시 피드백에 반영된다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { suggestions: ['다크모드를 추가해주세요'] },
        }),
      }),
    );

    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI 추천 받기/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('다크모드를 추가해주세요')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('다크모드를 추가해주세요'));
    expect(
      (screen.getByPlaceholderText(/차트를 막대 그래프/i) as HTMLTextAreaElement).value,
    ).toBe('다크모드를 추가해주세요');
  });

  it('추천 fetch 실패 시 빈 목록으로 idle 복귀', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI 추천 받기/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /AI 추천 받기/i })).toBeTruthy();
      expect(screen.queryByText(/AI 추천 수정 방향/)).toBeNull();
    });
  });

  it('generating 중 중복 제출을 차단한다', async () => {
    let resolveRegen: (() => void) | undefined;
    runClientRegeneration.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRegen = resolve;
        }),
    );

    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();

    fireEvent.change(screen.getByPlaceholderText(/차트를 막대 그래프/i), {
      target: { value: '충분히 긴 피드백 문장입니다' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /수정 생성/i }));
    });

    await waitFor(() => {
      expect(runClientRegeneration).toHaveBeenCalledTimes(1);
      expect(screen.getByText('수정 중...')).toBeTruthy();
    });

    // 진행 중 UI에서는 제출 버튼이 사라지고, status 가드도 중복을 막는다
    expect(screen.queryByRole('button', { name: /수정 생성/i })).toBeNull();
    expect(runClientRegeneration).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRegen?.();
    });
  });

  it('서버 오류 메시지를 화면에 표시한다', async () => {
    runClientRegeneration.mockImplementation(async (_input, deps) => {
      deps.failRegeneration('재생성 한도 초과');
    });

    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();

    fireEvent.change(screen.getByPlaceholderText(/차트를 막대 그래프/i), {
      target: { value: '충분히 긴 피드백 문장입니다' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /수정 생성/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/재생성 한도 초과/)).toBeTruthy();
    });
    expect(onRegenerationComplete).not.toHaveBeenCalled();
  });

  it('완료 후 추가 수정하기 로 idle 복귀', async () => {
    runClientRegeneration.mockImplementation(async (_input, deps) => {
      deps.completeRegeneration(2);
    });

    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();

    fireEvent.change(screen.getByPlaceholderText(/차트를 막대 그래프/i), {
      target: { value: '충분히 긴 피드백 문장입니다' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /수정 생성/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('수정이 완료되었습니다!')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /추가 수정하기/i }));
    expect(screen.getByRole('button', { name: /수정 생성/i })).toBeTruthy();
    expect(screen.queryByText('수정이 완료되었습니다!')).toBeNull();
  });

  it('terminal 가드: complete 후 같은 run 의 late fail 은 무시', async () => {
    runClientRegeneration.mockImplementation(async (_input, deps) => {
      deps.completeRegeneration(4);
      // 늦게 도착한 fail — 이중 콜백 시뮬레이션
      deps.failRegeneration('늦게 온 실패');
    });

    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();

    fireEvent.change(screen.getByPlaceholderText(/차트를 막대 그래프/i), {
      target: { value: '충분히 긴 피드백 문장입니다' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /수정 생성/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('수정이 완료되었습니다!')).toBeTruthy();
    });
    expect(screen.queryByText(/늦게 온 실패/)).toBeNull();
    expect(onRegenerationComplete).toHaveBeenCalledTimes(1);
  });

  // 이 테스트는 원래 `toHaveBeenCalledWith(1)` 이었다 — 즉 **"버전 미상"을 1번 버전으로**
  // 바꾸는 동작을 고정하고 있었다. 1번은 가장 오래된 버전이라, 계약이 깨지는 날 사용자는
  // **최신본 대신 최초 생성본**을 보게 된다(미리보기 URL 이 `&version=1` 로 붙는다).
  //
  // 미상일 때의 안전한 기본값은 "버전을 지정하지 않는 것"이다:
  // `codeRepo.findByProject(projectId, undefined)` 가 `orderBy(desc(version))` 로 최신 1건을
  // 돌려주므로, undefined 를 그대로 흘리면 자동으로 최신본이 된다(2026-08-07 코드 확인).
  it('version 이 undefined 면 그대로 undefined 로 통지한다 (1로 메우지 않는다)', async () => {
    runClientRegeneration.mockImplementation(async (_input, deps) => {
      deps.completeRegeneration(undefined);
    });

    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();

    fireEvent.change(screen.getByPlaceholderText(/차트를 막대 그래프/i), {
      target: { value: '충분히 긴 피드백 문장입니다' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /수정 생성/i }));
    });

    await waitFor(() => {
      expect(onRegenerationComplete).toHaveBeenCalledWith(undefined);
    });
  });

  it('언마운트 시 abortRegenerationSession 을 호출한다', async () => {
    runClientRegeneration.mockImplementation(
      () =>
        new Promise<void>(() => {
          /* hang until unmount aborts */
        }),
    );

    const { unmount } = render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();

    fireEvent.change(screen.getByPlaceholderText(/차트를 막대 그래프/i), {
      target: { value: '충분히 긴 피드백 문장입니다' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /수정 생성/i }));
    });

    await waitFor(() => {
      expect(runClientRegeneration).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(vi.mocked(abortRegenerationSession)).toHaveBeenCalled();
  });

  it('패널 토글 close/open', () => {
    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    expect(screen.queryByPlaceholderText(/차트를 막대 그래프/i)).toBeNull();
    openPanel();
    expect(screen.getByPlaceholderText(/차트를 막대 그래프/i)).toBeTruthy();
    // close
    fireEvent.click(screen.getByRole('button', { name: /프롬프트로 수정하기/i }));
    expect(screen.queryByPlaceholderText(/차트를 막대 그래프/i)).toBeNull();
  });

  it('textarea focus/blur 시 borderColor를 활성/기본으로 전환한다', () => {
    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();
    const ta = screen.getByPlaceholderText(/차트를 막대 그래프/i);

    fireEvent.focus(ta);
    // happy-dom이 var(...) 값을 style.borderColor에 그대로 보관한다.
    expect(ta.style.borderColor).toBe('var(--border-active)');

    fireEvent.blur(ta);
    expect(ta.style.borderColor).toBe('var(--border)');
  });

  it('추천 항목 mouseEnter/Leave 시 border·배경 스타일을 전환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { suggestions: ['호버 테스트 추천'] },
        }),
      }),
    );

    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /AI 추천 받기/i }));
    });

    const item = await screen.findByText('호버 테스트 추천');

    fireEvent.mouseEnter(item);
    expect(item.style.borderColor).toBe('var(--border-active)');
    expect(item.style.background).toBe('var(--bg-hover)');

    fireEvent.mouseLeave(item);
    expect(item.style.borderColor).toBe('var(--border)');
    expect(item.style.background).toBe('var(--bg-surface)');
  });

  it('stale run 콜백은 무시한다 (새 실행 시작 후 이전 progress/fail)', async () => {
    let deps1: {
      updateProgress: (p: number, m: string) => void;
      failRegeneration: (m: string) => void;
    } | null = null;

    runClientRegeneration
      .mockImplementationOnce(async (_input, deps) => {
        deps1 = deps;
        deps.completeRegeneration(1);
      })
      .mockImplementationOnce(async (_input, deps) => {
        deps.completeRegeneration(2);
      });

    render(
      <RePromptPanel projectId="proj-1" onRegenerationComplete={onRegenerationComplete} />,
    );
    openPanel();

    fireEvent.change(screen.getByPlaceholderText(/차트를 막대 그래프/i), {
      target: { value: '충분히 긴 첫 번째 피드백입니다' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /수정 생성/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('수정이 완료되었습니다!')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /추가 수정하기/i }));
    fireEvent.change(screen.getByPlaceholderText(/차트를 막대 그래프/i), {
      target: { value: '충분히 긴 두 번째 피드백입니다' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /수정 생성/i }));
    });
    await waitFor(() => {
      expect(onRegenerationComplete).toHaveBeenCalledWith(2);
    });

    // 이전 run 의 late 콜백 — 상태를 덮어쓰면 안 됨
    act(() => {
      deps1?.updateProgress(10, 'stale');
      deps1?.failRegeneration('stale fail');
    });
    expect(screen.queryByText(/stale fail/)).toBeNull();
    expect(screen.getByText('수정이 완료되었습니다!')).toBeTruthy();
  });
});
