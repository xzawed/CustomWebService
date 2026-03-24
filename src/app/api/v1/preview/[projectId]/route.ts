import { createClient } from '@/lib/supabase/server';
import { CodeRepository } from '@/repositories/codeRepository';
import { ProjectRepository } from '@/repositories/projectRepository';
import { assembleHtml } from '@/lib/ai/codeParser';
import {
  AuthRequiredError,
  NotFoundError,
  handleApiError,
} from '@/lib/utils/errors';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  try {
    const { projectId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthRequiredError();

    // Verify ownership
    const projectRepo = new ProjectRepository(supabase);
    const project = await projectRepo.findById(projectId);
    if (!project || project.userId !== user.id) {
      throw new NotFoundError('프로젝트', projectId);
    }

    // Get version from query params
    const url = new URL(request.url);
    const versionParam = url.searchParams.get('version');
    const version = versionParam ? Number(versionParam) : undefined;

    const codeRepo = new CodeRepository(supabase);
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
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'unsafe-inline' 'unsafe-eval'",
          "style-src 'unsafe-inline' https://fonts.googleapis.com",
          "font-src https://fonts.gstatic.com",
          "img-src * data: blob:",
          "connect-src *",
          "frame-ancestors 'self'",
        ].join('; '),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
