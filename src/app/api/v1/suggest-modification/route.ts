import { getDbProvider } from '@/lib/config/providers';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { createProjectRepository, createCatalogRepository } from '@/repositories/factory';
import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import { AuthRequiredError, NotFoundError, ValidationError, handleApiError, jsonResponse } from '@/lib/utils/errors';
import { suggestModificationSchema } from '@/types/schemas';
import { logger } from '@/lib/utils/logger';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    let projectId: string;
    let prompt: string;
    try {
      const body = await request.json();
      const parsed = suggestModificationSchema.parse(body);
      projectId = parsed.projectId;
      prompt = parsed.prompt ?? '';
    } catch (err) {
      if (err instanceof SyntaxError) {
        return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      }
      throw err;
    }

    // Verify ownership via service client (RLS bypass for project lookup)
    const serviceSupabase = getDbProvider() === 'supabase' ? await createServiceClient() : undefined;
    const projectRepo = createProjectRepository(serviceSupabase);
    const project = await projectRepo.findById(projectId);
    if (!project || project.userId !== user.id) {
      throw new NotFoundError('프로젝트', projectId);
    }

    // Fetch project's APIs
    const apiIds = await projectRepo.getProjectApiIds(projectId);
    const catalogRepo = createCatalogRepository(serviceSupabase);
    const apis = apiIds.length > 0 ? await catalogRepo.findByIds(apiIds) : [];

    const apiList = apis.length > 0
      ? apis.map((a) => `- ${a.name}: ${a.description}`).join('\n')
      : '(API 없음)';

    const promptHint = prompt
      ? `사용자가 입력한 부분적인 수정 방향: "${prompt}"\n이를 발전시킨 구체적인 수정 요청 3가지를 제안하세요.`
      : `현재 웹 서비스를 더 완성도 있게 개선할 수 있는 수정 아이디어 3가지를 제안하세요.`;

    const provider = AiProviderFactory.create();
    const aiResponse = await provider.generateCode({
      system: `당신은 웹 서비스 UI/UX 개선 전문가입니다.
사용자가 이미 생성한 웹 서비스를 더 좋게 개선하기 위한 수정 요청 문장 3가지를 제안합니다.
반드시 JSON 배열만 반환하세요: ["제안1", "제안2", "제안3"]
규칙:
- 각 제안은 50~150자의 한국어로 작성
- "~해주세요", "~추가해주세요", "~변경해주세요" 형태의 실제 수정 요청 말투
- 선택된 API를 더 잘 활용하는 방향 우선
- 3가지는 서로 다른 관점: UI 개선 / 기능 추가 / 데이터 시각화
- 마크다운, 코드 블록, 추가 설명 없이 순수 JSON 배열만 반환`,
      user: `프로젝트 설명: ${project.context}\n\n사용 중인 API:\n${apiList}\n\n${promptHint}`,
      temperature: 0.85,
      maxTokens: 600,
    });

    const match = aiResponse.content.match(/\[[\s\S]*?\]/);
    if (!match) {
      logger.warn('Modification suggestion: could not parse AI response', {
        content: aiResponse.content.slice(0, 200),
      });
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
      logger.warn('Modification suggestion: JSON parse failed', { raw: match[0].slice(0, 200) });
      return jsonResponse({ success: true, data: { suggestions: [] } });
    }

    return jsonResponse({ success: true, data: { suggestions } });
  } catch (error) {
    return handleApiError(error);
  }
}
