import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { AuthRequiredError, handleApiError, jsonResponse } from '@/lib/utils/errors';
import { getDbProvider } from '@/lib/config/providers';
import { createCatalogRepository } from '@/repositories/factory';
import {
  type PopularService,
  pickTopIds,
  computePopularServices,
  resolveCuratedServices,
} from '@/lib/services/popularServices';

export type { PopularService };

export async function GET(): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;
    const repo = createCatalogRepository(supabase);

    // Popular from real usage
    const usageRows = await repo.getApiUsageFromProjects(['generated', 'published']);
    let popularFromDb: PopularService[] = [];

    if (usageRows.length > 0) {
      const topIds = pickTopIds(usageRows, 5);
      if (topIds.length > 0) {
        const apiDetails = await repo.findByIds(topIds);
        popularFromDb = computePopularServices(usageRows, apiDetails);
      }
    }

    if (popularFromDb.length >= 5) {
      return jsonResponse({ success: true, data: { services: popularFromDb.slice(0, 5), source: 'usage' } });
    }

    // Curated fallback
    const nameToIdMap = await repo.getActiveNameToIdMap();
    const curatedWithIds = resolveCuratedServices(nameToIdMap);

    const existingIds = new Set(popularFromDb.map((s) => s.id));
    const merged = [...popularFromDb];
    for (const curated of curatedWithIds) {
      if (merged.length >= 5) break;
      if (!existingIds.has(curated.id)) merged.push(curated);
    }

    return jsonResponse({ success: true, data: { services: merged.slice(0, 5), source: 'mixed' } });
  } catch (error) {
    return handleApiError(error);
  }
}
