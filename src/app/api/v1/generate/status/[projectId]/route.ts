import { getAuthUser } from '@/lib/auth/index';
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
      return Response.json({ success: true, data: { status: 'unknown' } });
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
