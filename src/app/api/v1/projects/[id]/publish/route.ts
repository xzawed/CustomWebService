import { getDbProvider } from '@/lib/config/providers';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { createProjectService } from '@/services/factory';
import { createCodeRepository } from '@/repositories/factory';
import { AuthRequiredError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    // body.slug 파싱 — 실패해도 게시는 계속 진행
    let chosenSlug: string | undefined;
    try {
      const body = await request.json() as { slug?: unknown };
      if (typeof body?.slug === 'string') {
        chosenSlug = body.slug;
      }
    } catch {
      // body 없음 또는 JSON 파싱 실패 — slug 없이 진행
    }

    const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;

    // QC 경고 확인 — 게시는 차단하지 않지만 경고를 응답에 포함
    const codeRepo = createCodeRepository(supabase);
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

    const service = createProjectService(supabase);
    const project = await service.publish(id, user.id, chosenSlug);

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
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;
    const service = createProjectService(supabase);
    const project = await service.unpublish(id, user.id);

    return jsonResponse({ success: true, data: project });
  } catch (error) {
    return handleApiError(error);
  }
}
