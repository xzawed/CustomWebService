import { createClient } from '@/lib/supabase/server';
import { CatalogService } from '@/services/catalogService';
import { CatalogRepository } from '@/repositories/catalogRepository';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';

// 카탈로그는 자주 변하지 않으므로 CDN/브라우저에 1시간 캐싱
export const revalidate = 3600;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const supabase = await createClient();
    const service = new CatalogService(new CatalogRepository(supabase));

    const rawPage = searchParams.get('page');
    const rawLimit = searchParams.get('limit');
    const page = rawPage ? Math.max(1, parseInt(rawPage, 10) || 1) : 1;
    const limit = rawLimit ? Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20)) : 20;
    const search = searchParams.get('search') ?? undefined;

    const result = await service.search({
      category: searchParams.get('category') ?? undefined,
      search,
      page,
      limit,
    });

    // 검색어가 있으면 캐싱 단축, 없으면 1시간
    const maxAge = search ? 60 : 3600;
    return jsonResponse(
      { success: true, data: result },
      { headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=300` } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
