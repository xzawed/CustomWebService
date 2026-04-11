import { createClient } from '@/lib/supabase/server';
import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import { RateLimitService } from '@/services/rateLimitService';
import { AuthRequiredError, ValidationError, handleApiError, jsonResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

interface SuggestApiItem {
  name: string;
  description: string;
  category: string;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthRequiredError();

    const rateLimitService = new RateLimitService(supabase);
    await rateLimitService.checkAndIncrementDailyLimit(user.id);

    let apis: SuggestApiItem[];
    try {
      const body = await request.json();
      if (!Array.isArray(body.apis) || body.apis.length === 0) {
        throw new ValidationError('apis 목록이 필요합니다.');
      }
      if (body.apis.length > 5) {
        throw new ValidationError('최대 5개 API까지 허용됩니다.');
      }
      apis = (body.apis as unknown[]).map((a) => {
        if (typeof a !== 'object' || a === null) throw new ValidationError('잘못된 API 형식입니다.');
        const api = a as Record<string, unknown>;
        return {
          name: String(api.name ?? '').slice(0, 100),
          description: String(api.description ?? '').slice(0, 300),
          category: String(api.category ?? '').slice(0, 50),
        };
      });
    } catch (err) {
      if (err instanceof SyntaxError) {
        return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      }
      throw err;
    }

    const apiList = apis.map((a) => `- ${a.name}: ${a.description}`).join('\n');

    const provider = AiProviderFactory.createForTask('suggestion');
    const aiResponse = await provider.generateCode({
      system: `당신은 웹 서비스 아이디어를 제안하는 도우미입니다.
사용자가 선택한 API들을 기반으로 만들 수 있는 웹 서비스 아이디어 3가지를 제안하세요.
반드시 JSON 배열만 반환하세요: ["제안1", "제안2", "제안3"]
규칙:
- 각 제안은 100~200자의 한국어로 작성
- 사용자가 원하는 서비스를 직접 설명하는 말투로 (예: "~을 만들고 싶어요", "~를 보여주는 대시보드")
- 선택된 API를 자연스럽게 활용하는 아이디어
- 3가지는 서로 다른 방향의 아이디어 (대시보드형/계산기형/정보조회형 등)
- 마크다운, 코드 블록, 추가 설명 없이 순수 JSON 배열만 반환`,
      user: `선택된 API:\n${apiList}\n\n이 API들을 활용한 웹 서비스 아이디어 3가지를 JSON 배열로 제안해주세요.`,
      temperature: 0.8,
      maxTokens: 600,
    });

    // Extract JSON array from response (tolerates surrounding text or code blocks)
    const match = aiResponse.content.match(/\[[\s\S]*?\]/);
    if (!match) {
      logger.warn('Context suggestion: could not parse AI response', { content: aiResponse.content.slice(0, 200) });
      return jsonResponse({ success: true, data: { suggestions: [] } });
    }

    let suggestions: string[];
    try {
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) throw new Error('Not an array');
      suggestions = parsed
        .slice(0, 3)
        .map((s: unknown) => String(s).trim())
        .filter((s) => s.length > 0);
    } catch {
      logger.warn('Context suggestion: JSON parse failed', { raw: match[0].slice(0, 200) });
      return jsonResponse({ success: true, data: { suggestions: [] } });
    }

    logger.info('Context suggestions generated', {
      userId: user.id,
      apiCount: apis.length,
      suggestionsCount: suggestions.length,
    });

    return jsonResponse({ success: true, data: { suggestions } });
  } catch (error) {
    return handleApiError(error);
  }
}
