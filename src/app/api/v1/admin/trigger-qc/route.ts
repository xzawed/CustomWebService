import { createServiceClient } from '@/lib/supabase/server';
import { CodeRepository } from '@/repositories/codeRepository';
import { assembleHtml } from '@/lib/ai/codeParser';
import { runFastQc, runDeepQc, isQcEnabled } from '@/lib/qc';
import { adminCorsHeaders, verifyAdminKey, withAdminCors } from '@/lib/utils/adminAuth';
import { handleApiError, jsonResponse, ValidationError } from '@/lib/utils/errors';
import { triggerQcSchema } from '@/types/schemas';

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: adminCorsHeaders });
}

export async function POST(request: Request): Promise<Response> {
  const res = await (async () => {
    try {
      verifyAdminKey(request);

      if (!isQcEnabled()) {
        return jsonResponse({ success: false, error: { code: 'QC_DISABLED', message: 'ENABLE_RENDERING_QC is not enabled' } }, { status: 400 });
      }

      const body = await request.json();
      const { projectId } = triggerQcSchema.parse(body);

      const supabase = await createServiceClient();
      const codeRepo = new CodeRepository(supabase);
      const code = await codeRepo.findByProject(projectId);

      if (!code) {
        return jsonResponse({ success: false, error: { code: 'NOT_FOUND', message: '생성된 코드가 없습니다' } }, { status: 404 });
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
  })();
  return withAdminCors(res);
}
