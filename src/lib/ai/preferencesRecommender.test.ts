import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RelevanceGateResult } from '@/types/project';

// ---------- Mock Anthropic SDK ----------
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function() {
    return {
      messages: {
        create: mockCreate,
      },
    };
  }),
}));

// ---------- Helpers ----------
interface ToolInput {
  relevanceScore: number;
  reason: string;
  template: string | null;
  mood: string;
  audience: string;
  layoutPreference: string;
  resolutionOptions?: {
    suggestedContexts: string[];
    suggestedApis: { category: string; reason: string }[];
    creativeMerges: string[];
  } | null;
}

function makeToolUseResponse(input: ToolInput) {
  return {
    id: 'msg_01',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_01',
        name: 'recommend_preferences',
        input,
      },
    ],
    model: 'claude-haiku-4-5',
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 200 },
  };
}

function makeTextOnlyResponse() {
  return {
    id: 'msg_02',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: '죄송합니다, 도구를 사용할 수 없습니다.',
      },
    ],
    model: 'claude-haiku-4-5',
    stop_reason: 'end_turn',
    usage: { input_tokens: 50, output_tokens: 30 },
  };
}

const sampleInput = {
  context: '날씨와 뉴스를 결합한 대시보드 서비스를 만들고 싶어요.',
  apis: [
    { name: 'Weather API', category: 'weather', description: '날씨 정보 제공' },
    { name: 'News API', category: 'news', description: '뉴스 기사 제공' },
  ],
};

// ---------- Tests ----------
describe('recommendPreferences()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('고점수 정상 케이스: suggestion이 존재하고 resolutionOptions가 null이다', async () => {
    const toolInput: ToolInput = {
      relevanceScore: 85,
      reason: '날씨와 뉴스 API가 대시보드 컨텍스트에 자연스럽게 활용됩니다.',
      template: 'dashboard',
      mood: 'light',
      audience: 'general',
      layoutPreference: 'dashboard',
      resolutionOptions: null,
    };

    mockCreate.mockResolvedValueOnce(makeToolUseResponse(toolInput));

    const { recommendPreferences } = await import('./preferencesRecommender');
    const result: RelevanceGateResult = await recommendPreferences(sampleInput);

    expect(result.relevanceScore).toBe(85);
    expect(result.suggestion).not.toBeNull();
    expect(result.suggestion?.template).toBe('dashboard');
    expect(result.suggestion?.mood).toBe('light');
    expect(result.suggestion?.audience).toBe('general');
    expect(result.suggestion?.layoutPreference).toBe('dashboard');
    expect(result.resolutionOptions).toBeNull();
  });

  it('저점수 케이스: resolutionOptions가 존재한다', async () => {
    const toolInput: ToolInput = {
      relevanceScore: 40,
      reason: 'API와 컨텍스트 사이에 연관성이 낮습니다.',
      template: null,
      mood: 'auto',
      audience: 'general',
      layoutPreference: 'auto',
      resolutionOptions: {
        suggestedContexts: [
          '날씨 정보를 기반으로 한 여행 계획 서비스를 만들고 싶어요.',
          '실시간 날씨와 뉴스를 모니터링하는 대시보드를 만들고 싶어요.',
        ],
        suggestedApis: [
          { category: 'travel', reason: '여행 정보와 날씨를 연계할 수 있습니다.' },
          { category: 'maps', reason: '지역별 날씨 시각화에 유용합니다.' },
        ],
        creativeMerges: [
          '날씨 변화에 따라 관련 뉴스를 큐레이션하는 스마트 대시보드',
          '기상 이벤트와 연관된 뉴스를 타임라인으로 보여주는 서비스',
        ],
      },
    };

    mockCreate.mockResolvedValueOnce(makeToolUseResponse(toolInput));

    const { recommendPreferences } = await import('./preferencesRecommender');
    const result: RelevanceGateResult = await recommendPreferences(sampleInput);

    expect(result.relevanceScore).toBe(40);
    expect(result.suggestion).not.toBeNull();
    expect(result.resolutionOptions).not.toBeNull();
    expect(result.resolutionOptions?.suggestedContexts).toHaveLength(2);
    expect(result.resolutionOptions?.suggestedApis).toHaveLength(2);
    expect(result.resolutionOptions?.creativeMerges).toHaveLength(2);
  });

  it('폴백 케이스: messages.create throw → null 폴백 반환', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Network error'));

    const { recommendPreferences } = await import('./preferencesRecommender');
    const result: RelevanceGateResult = await recommendPreferences(sampleInput);

    expect(result.relevanceScore).toBeNull();
    expect(result.suggestion).toBeNull();
    expect(result.resolutionOptions).toBeNull();
  });

  it('tool_use 블록 없음: 텍스트 블록만 있을 때 폴백 반환', async () => {
    mockCreate.mockResolvedValueOnce(makeTextOnlyResponse());

    const { recommendPreferences } = await import('./preferencesRecommender');
    const result: RelevanceGateResult = await recommendPreferences(sampleInput);

    expect(result.relevanceScore).toBeNull();
    expect(result.suggestion).toBeNull();
    expect(result.resolutionOptions).toBeNull();
  });
});
