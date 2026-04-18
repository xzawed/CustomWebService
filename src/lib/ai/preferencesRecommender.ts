import Anthropic from '@anthropic-ai/sdk';
import type {
  RelevanceGateResult,
  PreferenceSuggestion,
  ResolutionOptions,
  TemplateId,
  DesignMood,
  DesignAudience,
  DesignLayout,
} from '@/types/project';

interface ApiInfo {
  name: string;
  category: string;
  description: string;
}

export interface RecommendInput {
  context: string;
  apis: ApiInfo[];
}

const SYSTEM_PROMPT = `당신은 웹서비스 생성 전문가입니다.
사용자가 선택한 API 목록과 서비스 컨텍스트(설명)의 연관성을 분석하고,
최적의 생성 옵션을 추천합니다.

판단 기준:
- 80~100점: API가 컨텍스트에 자연스럽게 활용 가능
- 60~79점: 일부 연관성 있으나 억지 해석 필요
- 0~59점: API와 컨텍스트가 거의 무관 (resolutionOptions 반드시 포함)

resolutionOptions는 점수 < 70 일 때만 채우세요.`;

const RECOMMEND_PREFERENCES_TOOL: Anthropic.Tool = {
  name: 'recommend_preferences',
  description:
    'Analyze the relevance between user context and selected APIs, then recommend optimal generation preferences',
  input_schema: {
    type: 'object',
    properties: {
      relevanceScore: {
        type: 'number',
        description: '0-100 점수. 100=완벽히 일치, 0=전혀 무관. 70 이상이면 높은 관련성',
      },
      reason: {
        type: 'string',
        description: '점수 근거를 한국어 1문장으로',
      },
      template: {
        type: 'string',
        enum: [
          'dashboard',
          'calculator',
          'info-lookup',
          'gallery',
          'map-service',
          'content-feed',
          'comparison',
          'timeline',
          'news-curator',
          'quiz',
          'profile',
        ],
        description: '가장 적합한 템플릿 ID. 불확실하면 이 필드를 생략하세요.',
      },
      mood: {
        type: 'string',
        enum: ['auto', 'light', 'dark', 'warm', 'colorful', 'minimal'],
      },
      audience: {
        type: 'string',
        enum: ['general', 'business', 'youth', 'premium'],
      },
      layoutPreference: {
        type: 'string',
        enum: ['auto', 'dashboard', 'feed', 'landing', 'tool'],
      },
      resolutionOptions: {
        type: 'object',
        description: 'relevanceScore < 70 일 때만 채워야 함',
        properties: {
          suggestedContexts: {
            type: 'array',
            items: { type: 'string' },
            description: '선택된 API에 어울리는 컨텍스트 제안 2~3개 (각 50~150자 한국어)',
          },
          suggestedApis: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                category: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['category', 'reason'],
            },
            description: '사용자 컨텍스트에 어울리는 API 카테고리 제안 2~3개',
          },
          creativeMerges: {
            type: 'array',
            items: { type: 'string' },
            description: 'API와 컨텍스트를 창의적으로 연결하는 해석 2~3개 (각 50~150자)',
          },
        },
        required: ['suggestedContexts', 'suggestedApis', 'creativeMerges'],
      },
    },
    required: ['relevanceScore', 'reason', 'mood', 'audience', 'layoutPreference'],
  },
};

const FALLBACK_RESULT: RelevanceGateResult = {
  relevanceScore: null,
  suggestion: null,
  resolutionOptions: null,
};

export async function recommendPreferences(input: RecommendInput): Promise<RelevanceGateResult> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const apiList = input.apis
      .map((a) => `- ${a.name} (${a.category}): ${a.description}`)
      .join('\n');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [RECOMMEND_PREFERENCES_TOOL],
      tool_choice: { type: 'tool', name: 'recommend_preferences' },
      messages: [
        {
          role: 'user',
          content: `서비스 컨텍스트: "${input.context}"\n\n선택된 API 목록:\n${apiList}`,
        },
      ],
    });

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUseBlock) {
      return FALLBACK_RESULT;
    }

    const toolInput = toolUseBlock.input as Record<string, unknown>;

    const suggestion: PreferenceSuggestion = {
      template: (toolInput.template as TemplateId | null | undefined) ?? null,
      mood: toolInput.mood as DesignMood,
      audience: toolInput.audience as DesignAudience,
      layoutPreference: toolInput.layoutPreference as DesignLayout,
      reason: toolInput.reason as string,
    };

    return {
      relevanceScore: toolInput.relevanceScore as number,
      suggestion,
      resolutionOptions: (toolInput.resolutionOptions as ResolutionOptions | null | undefined) ?? null,
    };
  } catch {
    return FALLBACK_RESULT;
  }
}
