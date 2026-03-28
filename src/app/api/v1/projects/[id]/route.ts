import { createClient } from '@/lib/supabase/server';
import { ProjectService } from '@/services/projectService';
import { AuthRequiredError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function GET(
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
    const project = await service.getById(id, user.id);

    return jsonResponse({ success: true, data: project });
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
    await service.delete(id, user.id);

    return jsonResponse({ success: true, message: '프로젝트가 삭제되었습니다.' });
  } catch (error) {
    return handleApiError(error);
  }
}
