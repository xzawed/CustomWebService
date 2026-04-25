import { getDbProvider } from '@/lib/config/providers';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { createProjectRepository, createCodeRepository } from '@/repositories/factory';
import { assembleHtml } from '@/lib/ai/codeParser';
import { AuthRequiredError, ForbiddenError, NotFoundError, ValidationError, handleApiError } from '@/lib/utils/errors';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  try {
    const { projectId } = await params;
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    // Verify ownership using service client to bypass RLS (Supabase-specific workaround)
    const serviceSupabase = getDbProvider() === 'supabase' ? await createServiceClient() : undefined;
    const projectRepo = createProjectRepository(serviceSupabase);
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

    const codeRepo = createCodeRepository(serviceSupabase);
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
        'Content-Security-Policy': [
          "default-src 'self'",
          // Allow inline scripts + common CDNs used by AI-generated pages (Tailwind, Chart.js, Font Awesome, etc.)
          "script-src 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://kit.fontawesome.com https://use.fontawesome.com https://stackpath.bootstrapcdn.com https://unpkg.com",
          "style-src 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://stackpath.bootstrapcdn.com https://unpkg.com",
          'font-src https://fonts.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://use.fontawesome.com https://kit.fontawesome.com data:',
          'img-src * data: blob:',
          'connect-src *',
          "frame-ancestors 'self'",
        ].join('; '),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
