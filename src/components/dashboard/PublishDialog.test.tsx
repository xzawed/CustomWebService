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
});
