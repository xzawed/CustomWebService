// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderComponent, screen, fireEvent, waitFor } from '@/test/helpers/component';
import { ProjectGrid } from './ProjectGrid';
import type { Project } from '@/types/project';

const publishMock = vi.fn();
const unpublishMock = vi.fn();

vi.mock('@/hooks/usePublish', () => ({
  usePublish: () => ({ publish: publishMock, unpublish: unpublishMock }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => (
    <a href={href} className={className}>{children as React.ReactNode}</a>
  ),
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

describe('ProjectGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('프로젝트가 없을 때 빈 상태 UI를 표시한다', () => {
    renderComponent(<ProjectGrid projects={[]} />);
    expect(screen.getByText('아직 만든 서비스가 없어요')).toBeTruthy();
    expect(screen.getByText('서비스 만들기')).toBeTruthy();
  });

  it('빈 상태에서 서비스 만들기 링크가 /builder를 가리킨다', () => {
    const { container } = renderComponent(<ProjectGrid projects={[]} />);
    const link = container.querySelector('a[href="/builder"]');
    expect(link).toBeTruthy();
  });

  it('프로젝트 목록을 카드로 렌더링한다', () => {
    renderComponent(<ProjectGrid projects={[baseProject]} />);
    expect(screen.getByText('테스트 프로젝트')).toBeTruthy();
  });

  it('여러 프로젝트를 모두 렌더링한다', () => {
    const projects = [
      baseProject,
      { ...baseProject, id: 'proj-2', name: '두 번째 프로젝트' },
    ];
    renderComponent(<ProjectGrid projects={projects} />);
    expect(screen.getByText('테스트 프로젝트')).toBeTruthy();
    expect(screen.getByText('두 번째 프로젝트')).toBeTruthy();
  });

  it('삭제 성공 시 프로젝트가 목록에서 제거된다', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    const projects = [
      baseProject,
      { ...baseProject, id: 'proj-2', name: '두 번째 프로젝트' },
    ];
    renderComponent(<ProjectGrid projects={projects} />);

    // Click delete on first project
    const deleteBtn = screen.getAllByRole('button', { name: '삭제' })[0];
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.queryByText('테스트 프로젝트')).toBeNull();
    });
    expect(screen.getByText('두 번째 프로젝트')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('/api/v1/projects/proj-1', { method: 'DELETE' });
  });

  it('삭제 실패 시 프로젝트 목록이 유지된다', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    renderComponent(<ProjectGrid projects={[baseProject]} />);

    const deleteBtn = screen.getByRole('button', { name: '삭제' });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    expect(screen.getByText('테스트 프로젝트')).toBeTruthy();
  });

  it('게시 성공 시 프로젝트 상태가 업데이트된다', async () => {
    const publishedProject = { ...baseProject, status: 'published' as const, slug: 'my-service' };
    publishMock.mockResolvedValueOnce({ data: publishedProject });

    renderComponent(<ProjectGrid projects={[baseProject]} />);

    const publishBtn = screen.getByRole('button', { name: '게시' });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(publishMock).toHaveBeenCalledWith('proj-1');
    });
  });

  it('게시 실패 시 예외가 전파되지 않는다', async () => {
    publishMock.mockRejectedValueOnce(new Error('publish error'));
    renderComponent(<ProjectGrid projects={[baseProject]} />);

    const publishBtn = screen.getByRole('button', { name: '게시' });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(publishMock).toHaveBeenCalled();
    });
    // Project card should still be visible (error swallowed)
    expect(screen.getByText('테스트 프로젝트')).toBeTruthy();
  });

  it('게시 취소 성공 시 프로젝트 상태가 업데이트된다', async () => {
    const publishedProject: Project = { ...baseProject, status: 'published', slug: 'my-service' };
    const unpublishedProject: Project = { ...baseProject, status: 'generated' };
    unpublishMock.mockResolvedValueOnce({ data: unpublishedProject });

    renderComponent(<ProjectGrid projects={[publishedProject]} />);

    const unpublishBtn = screen.getByRole('button', { name: '게시 취소' });
    fireEvent.click(unpublishBtn);

    await waitFor(() => {
      expect(unpublishMock).toHaveBeenCalledWith('proj-1');
    });
  });

  it('게시 취소 실패 시 예외가 전파되지 않는다', async () => {
    const publishedProject: Project = { ...baseProject, status: 'published', slug: 'my-service' };
    unpublishMock.mockRejectedValueOnce(new Error('unpublish error'));

    renderComponent(<ProjectGrid projects={[publishedProject]} />);

    const unpublishBtn = screen.getByRole('button', { name: '게시 취소' });
    fireEvent.click(unpublishBtn);

    await waitFor(() => {
      expect(unpublishMock).toHaveBeenCalled();
    });
    expect(screen.getByText('테스트 프로젝트')).toBeTruthy();
  });
});
