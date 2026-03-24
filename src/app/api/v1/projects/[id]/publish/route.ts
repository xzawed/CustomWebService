import { createClient } from '@/lib/supabase/server';
import { ProjectService } from '@/services/projectService';
import { AuthRequiredError, handleApiError } from '@/lib/utils/errors';

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

    const service = new ProjectService(supabase);
    const project = await service.publish(id, user.id);

    return Response.json({ success: true, data: project });
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

    return Response.json({ success: true, data: project });
  } catch (error) {
    return handleApiError(error);
  }
}
