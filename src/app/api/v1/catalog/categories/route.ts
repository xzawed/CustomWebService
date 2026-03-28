import { createClient } from '@/lib/supabase/server';
import { CatalogService } from '@/services/catalogService';
import { handleApiError } from '@/lib/utils/errors';

// 카테고리는 거의 변하지 않으므로 24시간 캐싱
export const revalidate = 86400;

export async function GET() {
  try {
    const supabase = await createClient();
    const service = new CatalogService(supabase);
    const categories = await service.getCategories();

    return Response.json(
      { success: true, data: categories },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
