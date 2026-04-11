import { getDbProvider } from '@/lib/config/providers';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { createProjectService } from '@/services/factory';
import { AuthRequiredError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;
    const service = createProjectService(supabase);
    const project = await service.publish(id, user.id);

    return jsonResponse({ success: true, data: project });
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
