import { getDbProvider } from '@/lib/config/providers';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import { createCatalogService, createRateLimitService } from '@/services/factory';
import { AuthRequiredError, ValidationError, handleApiError, jsonResponse } from '@/lib/utils/errors';
import { suggestApisSchema } from '@/types/schemas';
import { logger } from '@/lib/utils/logger';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    let context: string;
    try {
      const body = await request.json();
      const parsed = suggestApisSchema.parse(body);
      context = parsed.context;
    } catch (err) {
      if (err instanceof SyntaxError) {
        return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      }
      throw err;
    }

    const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;

    const rateLimitService = createRateLimitService(supabase);
    await rateLimitService.checkAndIncrementDailyLimit(user.id);

    // Fetch all active APIs from catalog
    const catalogService = createCatalogService(supabase);
    const { items: allApis } = await catalogService.search({ limit: 100 });

    // B-2: 헬스체크가 broken으로 표시한 API는 신규 서비스에 추천하지 않는다.
    // (카탈로그 브라우징에서는 그대로 노출 — '가용 유지' 정책. 추천 품질만 보호)
    // verificationStatus 미설정/null은 보수적으로 후보에 유지한다.
    const candidateApis = allApis.filter((a) => a.verificationStatus !== 'broken');

    // verified API에는 [검증됨] 배지를 달아 동등 관련성 시 우선 선택을 유도한다.
    const apiListForAi = candidateApis
      .map(
        (a) =>
          `- [ID:${a.id}] ${a.name} (${a.category})${a.verificationStatus === 'verified' ? ' [검증됨]' : ''}: ${a.description}`
      )
      .join('\n');

    const provider = AiProviderFactory.createForTask('suggestion');
    const aiResponse = await provider.generateCode({
      system: `당신은 웹 서비스 아이디어에 가장 적합한 API를 추천하는 전문가입니다.
사용자가 만들고 싶은 서비스 설명을 읽고, 주어진 API 목록에서 가장 적합한 API를 1~5개 선택하세요.

반드시 아래 JSON 형식만 반환하세요:
[{"id": "API_ID", "reason": "추천 이유 (30자 이내)"}]

규칙:
- 서비스 구현에 실질적으로 필요한 API만 선택
- 최소 1개, 최대 5개
- 가장 관련성 높은 순서로 정렬
- 관련성이 비슷하면 [검증됨] 표시가 있는 API를 우선 선택
- reason은 한국어로 간결하게 작성
- 마크다운, 코드 블록, 추가 설명 없이 순수 JSON 배열만 반환`,
      user: `## 사용 가능한 API 목록
${apiListForAi}

## 사용자가 만들고 싶은 서비스
${context}

위 서비스에 가장 적합한 API를 선택해주세요.`,
      temperature: 0.3,
      maxTokens: 500,
    });

    // Parse AI response
    const match = aiResponse.content.match(/\[[\s\S]*?\]/);
    if (!match) {
      logger.warn('API suggestion: could not parse AI response', {
        content: aiResponse.content.slice(0, 200),
      });
      return jsonResponse({ success: true, data: { recommendations: [] } });
    }

    let recommendations: { id: string; reason: string }[];
    try {
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) throw new Error('Not an array');
      recommendations = parsed
        .slice(0, 5)
        .filter(
          (item: unknown) =>
            typeof item === 'object' &&
            item !== null &&
            'id' in (item as Record<string, unknown>) &&
            'reason' in (item as Record<string, unknown>)
        )
        .map((item: { id: string; reason: string }) => ({
          id: String(item.id),
          reason: String(item.reason).slice(0, 100),
        }));
    } catch {
      logger.warn('API suggestion: JSON parse failed', { raw: match[0].slice(0, 200) });
      return jsonResponse({ success: true, data: { recommendations: [] } });
    }

    // Validate against the candidate set (broken APIs excluded) so a hallucinated
    // or broken ID can never slip into the recommendations.
    const validIds = new Set(candidateApis.map((a) => a.id));
    const validRecommendations = recommendations.filter((r) => validIds.has(r.id));

    // Attach full API info to each recommendation
    const apiMap = new Map(candidateApis.map((a) => [a.id, a]));
    const enriched = validRecommendations.map((r) => ({
      api: apiMap.get(r.id)!,
      reason: r.reason,
    }));

    logger.info('API suggestions generated', {
      userId: user.id,
      contextLength: context.length,
      recommendationCount: enriched.length,
    });

    return jsonResponse({ success: true, data: { recommendations: enriched } });
  } catch (error) {
    return handleApiError(error);
  }
}
