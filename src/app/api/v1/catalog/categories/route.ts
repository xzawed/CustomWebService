import { getDbProvider } from '@/lib/config/providers';
import { createClient } from '@/lib/supabase/server';
import { createCatalogService } from '@/services/factory';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';

// 카테고리는 거의 변하지 않으므로 24시간 캐싱
export const revalidate = 86400;

export async function GET() {
  try {
    const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;
    const service = createCatalogService(supabase);
    const categories = await service.getCategories();

    return jsonResponse(
      { success: true, data: categories },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
