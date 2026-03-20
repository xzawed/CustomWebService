import { createClient } from '@/lib/supabase/server';
import { CatalogService } from '@/services/catalogService';
import { handleApiError } from '@/lib/utils/errors';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const supabase = await createClient();
    const service = new CatalogService(supabase);

    const result = await service.search({
      category: searchParams.get('category') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      page: Number(searchParams.get('page') ?? 1),
      limit: Number(searchParams.get('limit') ?? 20),
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
