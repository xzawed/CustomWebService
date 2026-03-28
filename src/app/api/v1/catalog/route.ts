import { createClient } from '@/lib/supabase/server';
import { CatalogService } from '@/services/catalogService';
import { handleApiError } from '@/lib/utils/errors';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const supabase = await createClient();
    const service = new CatalogService(supabase);

    // parseInt with radix avoids NaN from non-numeric strings (e.g., ?page=abc → 1)
    const rawPage = searchParams.get('page');
    const rawLimit = searchParams.get('limit');
    const page = rawPage ? Math.max(1, parseInt(rawPage, 10) || 1) : 1;
    const limit = rawLimit ? Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20)) : 20;

    const result = await service.search({
      category: searchParams.get('category') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      page,
      limit,
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
