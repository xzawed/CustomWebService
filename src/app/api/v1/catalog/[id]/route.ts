import { createClient } from '@/lib/supabase/server';
import { CatalogService } from '@/services/catalogService';
import { handleApiError, NotFoundError } from '@/lib/utils/errors';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const service = new CatalogService(supabase);

    const item = await service.getById(id);
    if (!item) throw new NotFoundError('API', id);

    return Response.json({ success: true, data: item });
  } catch (error) {
    return handleApiError(error);
  }
}
