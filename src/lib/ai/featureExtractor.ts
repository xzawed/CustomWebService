import Anthropic from '@anthropic-ai/sdk';

export interface Feature {
  id: string; // snake_case identifier, e.g. "city-search"
  description: string; // what the feature does, e.g. "도시 이름으로 날씨 검색"
  verifiableBy:
    | 'input+button'
    | 'chart-element'
    | 'list'
    | 'filter-button'
    | 'text-display'
    | 'unknown';
}

export interface FeatureSpec {
  features: Feature[];
  stateNeeds: string[]; // e.g. ["selected-city", "weather-data"]
  apiUsage: string[]; // e.g. ["/forecast.json with q parameter"]
}

const FALLBACK_SPEC = (apiNames: string[]): FeatureSpec => ({
  features: [{ id: 'main-content', description: '메인 콘텐츠 표시', verifiableBy: 'list' }],
  stateNeeds: ['data'],
  apiUsage: apiNames,
});

const SYSTEM_PROMPT = `당신은 웹서비스 기능 분석가입니다. 사용자의 요청과 API 목록을 분석하여 구현할 기능 목록을 JSON으로 추출합니다.
각 기능은 사용자가 실제로 인터랙션할 수 있는 기능이어야 합니다.
verifiableBy는 Playwright로 어떻게 검증할지를 나타냅니다:
- input+button: 텍스트 입력 후 버튼 클릭
- chart-element: canvas 또는 차트 요소 존재
- list: 리스트 아이템 3개 이상 렌더링
- filter-button: 필터 버튼 클릭 → 목록 변화
- text-display: 텍스트 데이터 표시
- unknown: 검증 방법 불명확`;

const EXTRACT_FEATURES_TOOL: Anthropic.Tool = {
  name: 'extract_features',
  description: 'Extract the feature list, state needs, and API usage from user context',
  input_schema: {
    type: 'object',
    properties: {
      features: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            description: { type: 'string' },
            verifiableBy: {
              type: 'string',
              enum: [
                'input+button',
                'chart-element',
                'list',
                'filter-button',
                'text-display',
                'unknown',
              ],
            },
          },
          required: ['id', 'description', 'verifiableBy'],
        },
      },
      stateNeeds: { type: 'array', items: { type: 'string' } },
      apiUsage: { type: 'array', items: { type: 'string' } },
    },
    required: ['features', 'stateNeeds', 'apiUsage'],
  },
};

export async function extractFeatures(
  userContext: string,
  apiNames: string[],
): Promise<FeatureSpec> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [EXTRACT_FEATURES_TOOL],
      tool_choice: { type: 'tool', name: 'extract_features' },
      messages: [
        {
          role: 'user',
          content: `사용자 요청: "${userContext}"\n사용 API: ${apiNames.join(', ')}`,
        },
      ],
    });

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUseBlock) {
      return FALLBACK_SPEC(apiNames);
    }

    const input = toolUseBlock.input as FeatureSpec;

    if (!Array.isArray(input.features) || input.features.length === 0) {
      return FALLBACK_SPEC(apiNames);
    }

    return {
      features: input.features,
      stateNeeds: Array.isArray(input.stateNeeds) ? input.stateNeeds : [],
      apiUsage: Array.isArray(input.apiUsage) ? input.apiUsage : apiNames,
    };
  } catch {
    return FALLBACK_SPEC(apiNames);
  }
}
