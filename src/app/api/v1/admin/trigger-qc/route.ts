import { createServiceClient } from '@/lib/supabase/server';
import { CodeRepository } from '@/repositories/codeRepository';
import { assembleHtml } from '@/lib/ai/codeParser';
import { runFastQc, runDeepQc, isQcEnabled } from '@/lib/qc';
import { verifyAdminKey } from '@/lib/utils/adminAuth';
import { handleApiError, jsonResponse, ValidationError } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    verifyAdminKey(request);

    if (!isQcEnabled()) {
      return jsonResponse({ success: false, error: 'ENABLE_RENDERING_QC is not enabled' }, { status: 400 });
    }

    const body = await request.json() as { projectId?: string };
    const { projectId } = body;
    if (!projectId) throw new ValidationError('projectId는 필수입니다');

    const supabase = await createServiceClient();
    const codeRepo = new CodeRepository(supabase);
    const code = await codeRepo.findByProject(projectId);

    if (!code) {
      return jsonResponse({ success: false, error: '생성된 코드가 없습니다' }, { status: 404 });
    }

    const html = assembleHtml({
      html: code.codeHtml,
      css: code.codeCss ?? '',
      js: code.codeJs ?? '',
    });

    const [fastReport, deepReport] = await Promise.all([
      runFastQc(html),
      runDeepQc(html),
    ]);

    return jsonResponse({
      success: true,
      data: {
        projectId,
        version: code.version,
        fastQc: fastReport,
        deepQc: deepReport,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
