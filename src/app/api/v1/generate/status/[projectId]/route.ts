import { getAuthUser } from '@/lib/auth/index';
import { createCodeRepository, createProjectRepository } from '@/repositories/factory';
import { AuthRequiredError, handleApiError } from '@/lib/utils/errors';
import { generationTracker } from '@/lib/ai/generationTracker';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    const { projectId } = await params;

    const entry = generationTracker.get(projectId);

    if (!entry) {
      // 서버 재시작 등으로 인메모리 tracker가 유실된 경우 DB에서 최신 상태 확인
      const projectRepo = createProjectRepository();
      const project = await projectRepo.findById(projectId);
      // not_found 규약 유지: 프로젝트가 없거나 타인 소유이면 폴링 클라이언트가 기대하는
      // not_found 상태를 반환한다 (ForbiddenError를 throw하면 폴링 규약이 깨짐).
      if (project?.userId !== user.id) {
        return Response.json({ success: true, data: { status: 'not_found' } });
      }
      const codeRepo = createCodeRepository();
      const latestCode = await codeRepo.findByProject(projectId);
      if (latestCode) {
        return Response.json({
          success: true,
          data: {
            status: 'completed',
            result: {
              projectId,
              version: latestCode.version,
              previewUrl: `/api/v1/preview/${projectId}`,
            },
          },
        });
      }
      return Response.json({ success: true, data: { status: 'not_found' } });
    }

    if (entry.userId !== user.id) {
      // DB 경로와 동일하게 not_found를 반환한다 — ForbiddenError를 throw하면
      // 인플라이트 생성 존재 여부가 누출되어 폴링 규약이 깨짐.
      return Response.json({ success: true, data: { status: 'not_found' } });
    }

    const data: Record<string, unknown> = {
      status: entry.status,
      progress: entry.progress,
      step: entry.step,
      message: entry.message,
    };

    if (entry.status === 'completed' && entry.result) {
      data.result = entry.result;
    }

    if (entry.status === 'failed' && entry.error) {
      data.error = entry.error;
    }

    return Response.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}
