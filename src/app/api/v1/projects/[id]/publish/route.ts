import { createClient } from '@/lib/supabase/server';
import { ProjectService } from '@/services/projectService';
import { CodeRepository } from '@/repositories/codeRepository';
import { AuthRequiredError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthRequiredError();

    // QC 경고 확인 — 게시는 차단하지 않지만 경고를 응답에 포함
    const codeRepo = new CodeRepository(supabase);
    const latestCode = await codeRepo.findByProject(id);
    const metadata = latestCode?.metadata as Record<string, unknown> | null;
    const qcWarnings: string[] = [];

    if (metadata) {
      if (metadata.renderingQcPassed === false) {
        qcWarnings.push(`렌더링 QC 미통과 (점수: ${metadata.renderingQcScore ?? 'N/A'}/100)`);
        const checks = metadata.renderingQcChecks as Array<{ name: string; passed: boolean; details: string[] }> | undefined;
        if (checks) {
          for (const check of checks.filter(c => !c.passed)) {
            qcWarnings.push(`- ${check.name}: ${check.details.join(', ') || '실패'}`);
          }
        }
      }
    }

    const service = new ProjectService(supabase);
    const project = await service.publish(id, user.id);

    return jsonResponse({
      success: true,
      data: project,
      ...(qcWarnings.length > 0 && { qcWarnings }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthRequiredError();

    const service = new ProjectService(supabase);
    const project = await service.unpublish(id, user.id);

    return jsonResponse({ success: true, data: project });
  } catch (error) {
    return handleApiError(error);
  }
}
