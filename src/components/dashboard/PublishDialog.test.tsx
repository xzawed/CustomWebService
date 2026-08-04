// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PublishDialog } from './PublishDialog';
import type { Project } from '@/types/project';

const mockPublish = vi.fn();

vi.mock('@/hooks/usePublish', () => ({
  usePublish: () => ({
    publish: mockPublish,
    unpublish: vi.fn(),
    isLoading: false,
    error: null,
  }),
}));

const baseProject: Project = {
  id: 'proj-1',
  userId: 'user-1',
  organizationId: null,
  name: 'Test Project',
  context: 'test context',
  status: 'generated',
  deployUrl: null,
  deployPlatform: null,
  repoUrl: null,
  previewUrl: null,
  metadata: {},
  currentVersion: 1,
  apis: [],
  slug: null,
  suggestedSlugs: undefined,
  publishedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('PublishDialog', () => {
  const onClose = vi.fn();
  const onPublished = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('AI 추천 없을 때 직접 입력 폼만 표시된다', () => {
    render(
      <PublishDialog
        project={baseProject}
        onClose={onClose}
        onPublished={onPublished}
      />,
    );

    // No radio buttons for suggestions
    const radios = screen.queryAllByRole('radio');
    expect(radios.length).toBe(0);

    // Custom input is present
    expect(screen.getByPlaceholderText('my-service')).toBeTruthy();
  });

  it('AI 추천이 있을 때 라디오 버튼 3개 표시된다', () => {
    const project: Project = {
      ...baseProject,
      suggestedSlugs: ['weather-dashboard', 'seoul-weather-hub', 'korea-air-quality'],
    };

    render(
      <PublishDialog
        project={project}
        onClose={onClose}
        onPublished={onPublished}
      />,
    );

    const radios = screen.getAllByRole('radio');
    // 3 suggestion radios + 1 custom radio
    expect(radios.length).toBe(4);
    expect(screen.getByDisplayValue('weather-dashboard')).toBeTruthy();
    expect(screen.getByDisplayValue('seoul-weather-hub')).toBeTruthy();
    expect(screen.getByDisplayValue('korea-air-quality')).toBeTruthy();
  });

  it('게시하기 버튼은 커스텀 모드에서 available 상태일 때만 활성화', async () => {
    vi.useFakeTimers();

    // fetch resolves with available: true
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ data: { available: true } }),
      }),
    );

    // No suggestions → custom mode by default
    render(
      <PublishDialog
        project={baseProject}
        onClose={onClose}
        onPublished={onPublished}
      />,
    );

    const publishButton = screen.getByRole('button', { name: '게시하기' });

    // idle state → disabled
    expect(publishButton.hasAttribute('disabled')).toBe(true);

    // Type something — checkResult transitions to 'checking'
    const input = screen.getByPlaceholderText('my-service');
    fireEvent.change(input, { target: { value: 'my-slug' } });

    // Still disabled while checking (debounce not yet fired)
    expect(publishButton.hasAttribute('disabled')).toBe(true);

    // Advance past the 300ms debounce; vi.runAllTimersAsync flushes timers
    // and awaits any resulting microtasks (including the fetch promise chain)
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // fetch resolved with available: true → button should be enabled
    expect(publishButton.hasAttribute('disabled')).toBe(false);
  });

  it('취소 버튼이 onClose를 호출한다', () => {
    render(
      <PublishDialog
        project={baseProject}
        onClose={onClose}
        onPublished={onPublished}
      />,
    );

    const cancelButton = screen.getByRole('button', { name: '취소' });
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ESC 키로 다이얼로그가 닫힌다', () => {
    render(
      <PublishDialog
        project={baseProject}
        onClose={onClose}
        onPublished={onPublished}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('AI 추천 선택 후 게시하기를 누르면 선택한 slug로 publish가 호출된다', async () => {
    const project: Project = {
      ...baseProject,
      suggestedSlugs: ['weather-dashboard', 'seoul-hub', 'korea-air'],
    };

    render(
      <PublishDialog
        project={project}
        onClose={onClose}
        onPublished={onPublished}
      />,
    );

    // First suggestion is pre-selected by default
    const publishButton = screen.getByRole('button', { name: '게시하기' });
    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledWith(project.id, 'weather-dashboard');
    });
  });

  it('기본 주소로 게시 버튼이 slug 없이 publish를 호출한다', async () => {
    render(
      <PublishDialog
        project={baseProject}
        onClose={onClose}
        onPublished={onPublished}
      />,
    );

    const defaultButton = screen.getByRole('button', { name: '기본 주소로 게시' });
    fireEvent.click(defaultButton);

    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledWith(baseProject.id);
    });
  });

  // ───────────────────────────────────────────────
  // slug 검사 실패 분기 (E5 · T4)
  //
  // reason별 안내 문구가 전부 미실행이었다. 문구가 틀리면 사용자는 왜 막혔는지 모른 채
  // 같은 주소를 계속 시도한다. 어느 reason이든 게시 버튼은 잠긴 상태여야 한다.
  // ───────────────────────────────────────────────
  describe('slug 검사 결과 표시', () => {
    async function typeSlugAndSettle(
      responseBody: unknown,
    ): Promise<HTMLElement> {
      vi.useFakeTimers();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ json: () => Promise.resolve(responseBody) }),
      );

      render(
        <PublishDialog
          project={baseProject}
          onClose={onClose}
          onPublished={onPublished}
        />,
      );

      fireEvent.change(screen.getByPlaceholderText('my-service'), {
        target: { value: 'my-slug' },
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      return screen.getByRole('button', { name: '게시하기' });
    }

    it.each([
      ['invalid', '유효하지 않은 형식입니다'],
      ['reserved', '예약된 주소입니다'],
      ['taken', '이미 사용 중입니다'],
    ])('reason=%s 이면 "%s"를 보여주고 게시 버튼을 잠근다', async (reason, message) => {
      const publishButton = await typeSlugAndSettle({
        data: { available: false, reason },
      });

      expect(screen.getByText(message)).toBeTruthy();
      expect(publishButton.hasAttribute('disabled')).toBe(true);
    });

    it('알 수 없는 reason은 taken으로 취급한다 (fail-closed)', async () => {
      // 서버가 새 reason을 추가해도 게시가 열리면 안 된다.
      const publishButton = await typeSlugAndSettle({
        data: { available: false, reason: 'some-future-reason' },
      });

      expect(screen.getByText('이미 사용 중입니다')).toBeTruthy();
      expect(publishButton.hasAttribute('disabled')).toBe(true);
    });

    it('slug 검사 요청이 실패하면 idle로 되돌아가 게시 버튼이 잠긴 채로 남는다', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

      render(
        <PublishDialog
          project={baseProject}
          onClose={onClose}
          onPublished={onPublished}
        />,
      );

      fireEvent.change(screen.getByPlaceholderText('my-service'), {
        target: { value: 'my-slug' },
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // idle에는 안내 문구가 없다 — 잘못 '사용 가능'으로 보이지만 않으면 된다.
      expect(screen.queryByText('사용 가능')).toBeNull();
      expect(
        screen.getByRole('button', { name: '게시하기' }).hasAttribute('disabled'),
      ).toBe(true);
    });

    it('fetch가 AbortError로 거부되면 checkResult가 checking에 머문다', async () => {
      vi.useFakeTimers();
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

      render(
        <PublishDialog
          project={baseProject}
          onClose={onClose}
          onPublished={onPublished}
        />,
      );

      fireEvent.change(screen.getByPlaceholderText('my-service'), {
        target: { value: 'my-slug' },
      });

      // 디바운스(300ms) 경과 → fetch가 AbortError로 거부된다
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // AbortError 가드가 없으면 catch가 setCheckResult('idle')을 불러 안내가 사라진다.
      // 취소된 요청 때문에 '확인 중'이 풀리면 사용자는 멀쩡한 slug를 확인 불가로 본다.
      expect(screen.getByText('확인 중...')).toBeTruthy();
    });

    it('언마운트하면 디바운스 타이머가 취소되어 slug 확인 요청이 나가지 않는다', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const { unmount } = render(
        <PublishDialog
          project={baseProject}
          onClose={onClose}
          onPublished={onPublished}
        />,
      );

      fireEvent.change(screen.getByPlaceholderText('my-service'), {
        target: { value: 'my-slug' },
      });

      unmount();
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // cleanup이 clearTimeout을 놓치면 언마운트 뒤에 요청이 나가고,
      // 사라진 컴포넌트에 setState를 시도하게 된다.
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────
  // 게시 실패 분기 (E5 · T4)
  //
  // 핵심 계약은 "에러 문구가 보인다"가 아니라 **다이얼로그가 닫히지 않는다**는 것이다.
  // 실패했는데 onClose/onPublished가 불리면 사용자는 게시되지 않은 걸 게시됐다고 믿고,
  // 재시도할 화면조차 사라진다.
  // ───────────────────────────────────────────────
  describe('게시 실패', () => {
    it('publish가 Error로 거부되면 메시지를 보여주고 다이얼로그를 닫지 않는다', async () => {
      mockPublish.mockRejectedValueOnce(new Error('slug가 이미 사용 중입니다'));

      render(
        <PublishDialog
          project={baseProject}
          onClose={onClose}
          onPublished={onPublished}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: '기본 주소로 게시' }));

      expect(await screen.findByText('slug가 이미 사용 중입니다')).toBeTruthy();
      expect(onPublished).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('Error가 아닌 값으로 거부돼도 기본 실패 문구를 보여준다', async () => {
      // fetch 계층이 문자열·객체를 던지는 경우가 있어 `err instanceof Error` 폴백이 필요하다.
      mockPublish.mockRejectedValueOnce('network down');

      render(
        <PublishDialog
          project={baseProject}
          onClose={onClose}
          onPublished={onPublished}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: '기본 주소로 게시' }));

      expect(await screen.findByText('게시에 실패했습니다.')).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('AI 추천 경로에서 실패해도 다이얼로그가 유지되고 재시도할 수 있다', async () => {
      mockPublish.mockRejectedValueOnce(new Error('일시적 오류'));

      render(
        <PublishDialog
          project={{ ...baseProject, suggestedSlugs: ['weather-dashboard', 'seoul-hub'] }}
          onClose={onClose}
          onPublished={onPublished}
        />,
      );

      const publishButton = screen.getByRole('button', { name: '게시하기' });
      fireEvent.click(publishButton);

      expect(await screen.findByText('일시적 오류')).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();

      // finally 블록이 isPublishing을 되돌리므로 버튼이 다시 눌려야 한다.
      // 이게 깨지면 한 번 실패한 사용자는 영영 게시할 수 없다.
      await waitFor(() => {
        expect((publishButton as HTMLButtonElement).disabled).toBe(false);
      });

      mockPublish.mockResolvedValueOnce(undefined);
      fireEvent.click(publishButton);

      await waitFor(() => {
        expect(onPublished).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it('재시도가 성공하면 이전 에러 문구가 사라진다', async () => {
      mockPublish.mockRejectedValueOnce(new Error('첫 시도 실패'));

      render(
        <PublishDialog
          project={baseProject}
          onClose={onClose}
          onPublished={onPublished}
        />,
      );

      const defaultButton = screen.getByRole('button', { name: '기본 주소로 게시' });
      fireEvent.click(defaultButton);
      expect(await screen.findByText('첫 시도 실패')).toBeTruthy();

      mockPublish.mockResolvedValueOnce(undefined);
      fireEvent.click(defaultButton);

      await waitFor(() => {
        expect(screen.queryByText('첫 시도 실패')).toBeNull();
      });
    });
  });
});
