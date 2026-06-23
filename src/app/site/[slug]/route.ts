import { createCodeRepository, createProjectRepository } from '@/repositories/factory';
import { assembleHtml } from '@/lib/ai/codeParser';
import { isValidSlug, RESERVED_SLUGS } from '@/lib/utils/slugify';
import { notFoundHtml, preparingHtml } from '@/lib/templates/siteError';
import { SITE_CSP } from '@/lib/constants/cdn';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;

  // 1. 슬러그 유효성 검사
  if (!isValidSlug(slug)) {
    if (RESERVED_SLUGS.has(slug)) {
      return new Response(notFoundHtml(slug), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return new Response('Invalid slug', { status: 400 });
  }

  const projectRepo = createProjectRepository();

  // 2. Slug로 프로젝트 조회
  const project = await projectRepo.findBySlug(slug);
  if (!project) {
    return new Response(notFoundHtml(slug), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // 3. 게시 상태 확인
  if (project.status !== 'published') {
    return new Response(preparingHtml(slug), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // 4. 코드 조회
  const codeRepo = createCodeRepository();
  const code = await codeRepo.findByProject(project.id);
  if (!code) {
    return new Response(preparingHtml(slug), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // 5. HTML 조합 후 반환
  const fullHtml = assembleHtml({
    html: code.codeHtml,
    css: code.codeCss,
    js: code.codeJs,
  });

  return new Response(fullHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      'Content-Security-Policy': SITE_CSP,
      'X-Robots-Tag': 'index, follow',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      // Prevent window.opener access between AI-generated site and main app
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  });
}
