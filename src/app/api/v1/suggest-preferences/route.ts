import { getDbProvider } from '@/lib/config/providers';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { createRateLimitService, createCatalogService } from '@/services/factory';
import { AuthRequiredError, ValidationError, handleApiError, jsonResponse } from '@/lib/utils/errors';
import { suggestPreferencesSchema } from '@/types/schemas';
import { recommendPreferences } from '@/lib/ai/preferencesRecommender';
import { logger } from '@/lib/utils/logger';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;

    const rateLimitService = createRateLimitService(supabase);
    await rateLimitService.checkAndIncrementDailyLimit(user.id);

    let context: string;
    let apiIds: string[];
    try {
      const body = await request.json();
      const parsed = suggestPreferencesSchema.parse(body);
      context = parsed.context;
      apiIds = parsed.apiIds;
    } catch (err) {
      if (err instanceof SyntaxError) {
        return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      }
      throw err;
    }

    const catalogService = createCatalogService(supabase);
    const apis = await catalogService.getByIds(apiIds);

    const apiInfos = apis.map((a) => ({
      name: a.name,
      category: a.category,
      description: a.description,
    }));

    const result = await recommendPreferences({ context, apis: apiInfos });

    logger.info('Preferences recommendation generated', {
      userId: user.id,
      contextLength: context.length,
      apiCount: apiIds.length,
      relevanceScore: result.relevanceScore,
    });

    return jsonResponse({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
