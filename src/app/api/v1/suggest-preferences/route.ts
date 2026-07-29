import { getAuthUser } from '@/lib/auth/index';
import { assertEmailVerified } from '@/lib/auth/verifiedGuard';
import { createRateLimitService, createCatalogService } from '@/services/factory';
import { AuthRequiredError, ValidationError, handleApiError, jsonResponse } from '@/lib/utils/errors';
import { suggestPreferencesSchema } from '@/types/schemas';
import { recommendPreferences } from '@/lib/ai/preferencesRecommender';
import { logger } from '@/lib/utils/logger';

export async function POST(request: Request): Promise<Response> {
  let pendingDecrement: (() => Promise<void>) | undefined;

  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();
    await assertEmailVerified(user.id);

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

    const rateLimitService = createRateLimitService();
    const { charged } = await rateLimitService.checkAndIncrementDailySuggestionLimit(user.id);
    if (charged) {
      pendingDecrement = () => rateLimitService.decrementDailySuggestionLimit(user.id);
    }

    const catalogService = createCatalogService();
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
    await pendingDecrement?.().catch(() => {});
    return handleApiError(error);
  }
}
