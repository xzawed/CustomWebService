// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderComponent, screen, fireEvent, waitFor } from '@/test/helpers/component';
import { ProjectPublishActions } from './ProjectPublishActions';
import type { Project } from '@/types/project';

const mockPublish = vi.fn();
const mockUnpublish = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('@/hooks/usePublish', () => ({
  usePublish: () => ({
    publish: mockPublish,
    unpublish: mockUnpublish,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('./PublishDialog', () => ({
  PublishDialog: () => <div data-testid="publish-dialog" />,
}));

vi.mock('@/lib/utils/publishUrl', () => ({
  buildPublishUrl: (slug: string) => `https://${slug}.xzawed.xyz`,
}));

const baseProject: Project = {
  id: 'proj-1',
  userId: 'user-1',
  organizationId: null,
  name: '테스트 프로젝트',
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

describe('ProjectPublishActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('status="generated"일 때 "게시하기" 버튼이 표시된다', () => {
    renderComponent(<ProjectPublishActions project={baseProject} />);
    expect(screen.getByRole('button', { name: '게시하기' })).toBeTruthy();
  });

  it('slug가 없을 때 "게시하기" 클릭 → PublishDialog가 열린다', () => {
    renderComponent(<ProjectPublishActions project={baseProject} />);
    fireEvent.click(screen.getByRole('button', { name: '게시하기' }));
    expect(screen.getByTestId('publish-dialog')).toBeTruthy();
  });

  it('slug가 있을 때 "게시하기" 클릭 → publish(id)가 직접 호출된다', async () => {
    renderComponent(
      <ProjectPublishActions project={{ ...baseProject, slug: 'my-service' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '게시하기' }));
    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledWith('proj-1');
    });
  });

  it('status="published"일 때 "게시 취소" 버튼이 표시된다', () => {
    renderComponent(
      <ProjectPublishActions project={{ ...baseProject, status: 'published' }} />,
    );
    expect(screen.getByRole('button', { name: '게시 취소' })).toBeTruthy();
  });

  it('"게시 취소" 버튼 클릭 시 unpublish(id)가 호출된다', async () => {
    renderComponent(
      <ProjectPublishActions project={{ ...baseProject, status: 'published' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '게시 취소' }));
    await waitFor(() => {
      expect(mockUnpublish).toHaveBeenCalledWith('proj-1');
    });
  });
});
