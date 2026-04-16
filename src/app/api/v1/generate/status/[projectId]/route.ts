import { getAuthUser } from '@/lib/auth/index';
import { createClient } from '@/lib/supabase/server';
import { createCodeRepository } from '@/repositories/factory';
import { AuthRequiredError, ForbiddenError, handleApiError } from '@/lib/utils/errors';
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
      const supabase = await createClient();
      const codeRepo = createCodeRepository(supabase);
      const latestCode = await codeRepo.findByProject(projectId);
      if (latestCode) {
        return Response.json({ success: true, data: { status: 'completed' } });
      }
      return Response.json({ success: true, data: { status: 'not_found' } });
    }

    if (entry.userId !== user.id) {
      throw new ForbiddenError();
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
