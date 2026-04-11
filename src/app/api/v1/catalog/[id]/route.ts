import { getDbProvider } from '@/lib/config/providers';
import { createClient } from '@/lib/supabase/server';
import { createCatalogService } from '@/services/factory';
import { handleApiError, NotFoundError, jsonResponse } from '@/lib/utils/errors';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;
    const service = createCatalogService(supabase);

    const item = await service.getById(id);
    if (!item) throw new NotFoundError('API', id);

    return jsonResponse({ success: true, data: item });
  } catch (error) {
    return handleApiError(error);
  }
}
