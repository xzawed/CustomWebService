// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { ProjectCard } from './ProjectCard';
import type { Project } from '@/types/project';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as React.ReactNode}</a>
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

describe('ProjectCard', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('프로젝트 이름을 렌더링한다', () => {
    renderComponent(<ProjectCard project={baseProject} />);
    expect(screen.getByText('테스트 프로젝트')).toBeTruthy();
  });

  it('"generated" 상태 뱃지가 "생성 완료"로 표시된다', () => {
    renderComponent(<ProjectCard project={baseProject} />);
    expect(screen.getByText('생성 완료')).toBeTruthy();
  });

  it('"published" 상태 뱃지가 "게시됨"으로 표시된다', () => {
    renderComponent(<ProjectCard project={{ ...baseProject, status: 'published' }} />);
    expect(screen.getByText('게시됨')).toBeTruthy();
  });

  it('"failed" 상태 뱃지가 "실패"로 표시된다', () => {
    renderComponent(<ProjectCard project={{ ...baseProject, status: 'failed' }} />);
    expect(screen.getByText('실패')).toBeTruthy();
  });

  it('onPublish prop이 있고 status가 "generated"일 때 "게시" 버튼이 표시된다', () => {
    renderComponent(<ProjectCard project={baseProject} onPublish={vi.fn()} />);
    expect(screen.getByRole('button', { name: '게시' })).toBeTruthy();
  });

  it('"게시" 버튼 클릭 시 onPublish가 project.id와 함께 호출된다', () => {
    const onPublish = vi.fn();
    renderComponent(<ProjectCard project={baseProject} onPublish={onPublish} />);
    fireEvent.click(screen.getByRole('button', { name: '게시' }));
    expect(onPublish).toHaveBeenCalledWith('proj-1');
  });

  it('status "published"이고 onUnpublish prop이 있을 때 "게시 취소" 버튼이 표시된다', () => {
    renderComponent(
      <ProjectCard project={{ ...baseProject, status: 'published' }} onUnpublish={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '게시 취소' })).toBeTruthy();
  });

  it('slug가 있고 published 상태일 때 "URL 복사" 버튼이 표시된다', () => {
    renderComponent(
      <ProjectCard project={{ ...baseProject, status: 'published', slug: 'my-service' }} />,
    );
    expect(screen.getByRole('button', { name: 'URL 복사' })).toBeTruthy();
  });

  it('"URL 복사" 버튼 클릭 시 navigator.clipboard.writeText가 호출된다', () => {
    renderComponent(
      <ProjectCard project={{ ...baseProject, status: 'published', slug: 'my-service' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'URL 복사' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});
