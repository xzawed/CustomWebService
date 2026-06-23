import { getAuthUser } from '@/lib/auth/index';
import { createProjectRepository, createCodeRepository } from '@/repositories/factory';
import { assembleHtml } from '@/lib/ai/codeParser';
import { AuthRequiredError, ForbiddenError, NotFoundError, ValidationError, handleApiError } from '@/lib/utils/errors';
import { PREVIEW_CSP } from '@/lib/constants/cdn';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  try {
    const { projectId } = await params;
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    const projectRepo = createProjectRepository();
    const project = await projectRepo.findById(projectId);
    if (!project) {
      throw new NotFoundError('프로젝트', projectId);
    }
    if (project.userId !== user.id) {
      throw new ForbiddenError();
    }

    // Get version from query params
    const url = new URL(request.url);
    const versionParam = url.searchParams.get('version');
    let version: number | undefined;
    if (versionParam !== null) {
      const parsed = parseInt(versionParam, 10);
      if (isNaN(parsed) || parsed < 1) {
        throw new ValidationError('version은 1 이상의 정수여야 합니다.');
      }
      version = parsed;
    }

    const codeRepo = createCodeRepository();
    const code = await codeRepo.findByProject(projectId, version);
    if (!code) {
      throw new NotFoundError('생성된 코드', projectId);
    }

    const fullHtml = assembleHtml({
      html: code.codeHtml,
      css: code.codeCss,
      js: code.codeJs,
    });

    return new Response(fullHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'SAMEORIGIN',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        // CSP 정책은 src/lib/constants/cdn.ts에서 단일 출처 관리 (사용자 페이지와 동일 정책)
        'Content-Security-Policy': PREVIEW_CSP,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
