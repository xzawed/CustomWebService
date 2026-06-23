import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/repositories/factory', () => ({
  createProjectRepository: vi.fn(),
  createCodeRepository: vi.fn(),
}));

vi.mock('@/lib/ai/codeParser', () => ({
  assembleHtml: vi.fn().mockReturnValue('<!DOCTYPE html><html><body>published</body></html>'),
}));

const publishedProject = {
  id: 'project-1',
  status: 'published',
};

const generatedCode = {
  codeHtml: '<div>published</div>',
  codeCss: '',
  codeJs: '',
};

function params(slug = 'my-site') {
  return { params: Promise.resolve({ slug }) };
}

describe('GET /site/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('published 프로젝트는 zero-arg repository factory로 조회해 HTML을 반환한다', async () => {
    const { createProjectRepository, createCodeRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findBySlug: vi.fn().mockResolvedValue(publishedProject),
    } as never);
    vi.mocked(createCodeRepository).mockReturnValue({
      findByProject: vi.fn().mockResolvedValue(generatedCode),
    } as never);

    const { GET } = await import('@/app/site/[slug]/route');
    const response = await GET(new Request('http://localhost/site/my-site'), params());

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('published');

    expect(createProjectRepository).toHaveBeenCalledWith();
    expect(createCodeRepository).toHaveBeenCalledWith();
  });

  it('없는 slug는 404 HTML을 반환한다', async () => {
    const { createProjectRepository } = await import('@/repositories/factory');
    vi.mocked(createProjectRepository).mockReturnValue({
      findBySlug: vi.fn().mockResolvedValue(null),
    } as never);

    const { GET } = await import('@/app/site/[slug]/route');
    const response = await GET(new Request('http://localhost/site/missing'), params('missing'));

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  });
});
