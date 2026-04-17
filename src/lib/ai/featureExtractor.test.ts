import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature, FeatureSpec } from './featureExtractor';

// ---------- Mock Anthropic SDK ----------
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  })),
}));

// ---------- Helpers ----------
function makeToolUseResponse(input: FeatureSpec) {
  return {
    id: 'msg_01',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_01',
        name: 'extract_features',
        input,
      },
    ],
    model: 'claude-haiku-4-5',
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 150 },
  };
}

function makeEmptyResponse() {
  return {
    id: 'msg_02',
    type: 'message',
    role: 'assistant',
    content: [],
    model: 'claude-haiku-4-5',
    stop_reason: 'end_turn',
    usage: { input_tokens: 50, output_tokens: 0 },
  };
}

// ---------- Tests ----------
describe('extractFeatures()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('올바른 도구 호출 응답에서 FeatureSpec을 파싱한다', async () => {
    const expectedFeatures: Feature[] = [
      { id: 'city-search', description: '도시 이름으로 날씨 검색', verifiableBy: 'input+button' },
      { id: 'weather-display', description: '현재 날씨 정보 표시', verifiableBy: 'text-display' },
    ];
    const expectedSpec: FeatureSpec = {
      features: expectedFeatures,
      stateNeeds: ['selected-city', 'weather-data'],
      apiUsage: ['/forecast.json with q parameter'],
    };

    mockCreate.mockResolvedValueOnce(makeToolUseResponse(expectedSpec));

    const { extractFeatures } = await import('./featureExtractor');
    const result = await extractFeatures('날씨 앱을 만들어주세요', ['OpenWeather API']);

    expect(result.features).toHaveLength(2);
    expect(result.features[0].id).toBe('city-search');
    expect(result.features[0].verifiableBy).toBe('input+button');
    expect(result.stateNeeds).toEqual(['selected-city', 'weather-data']);
    expect(result.apiUsage).toEqual(['/forecast.json with q parameter']);
  });

  it('네트워크 오류 시 fallback FeatureSpec을 반환한다', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Network error'));

    const { extractFeatures } = await import('./featureExtractor');
    const result = await extractFeatures('날씨 앱을 만들어주세요', ['OpenWeather API']);

    expect(result.features).toHaveLength(1);
    expect(result.features[0].id).toBe('main-content');
    expect(result.features[0].verifiableBy).toBe('list');
    expect(result.stateNeeds).toEqual(['data']);
    expect(result.apiUsage).toEqual(['OpenWeather API']);
  });

  it('features가 비어있으면 fallback FeatureSpec을 반환한다', async () => {
    const emptyFeaturesSpec: FeatureSpec = {
      features: [],
      stateNeeds: ['some-state'],
      apiUsage: ['some-api'],
    };

    mockCreate.mockResolvedValueOnce(makeToolUseResponse(emptyFeaturesSpec));

    const { extractFeatures } = await import('./featureExtractor');
    const result = await extractFeatures('날씨 앱을 만들어주세요', ['WeatherAPI']);

    expect(result.features).toHaveLength(1);
    expect(result.features[0].id).toBe('main-content');
    expect(result.stateNeeds).toEqual(['data']);
    expect(result.apiUsage).toEqual(['WeatherAPI']);
  });

  it('tool_use 블록이 없으면 fallback FeatureSpec을 반환한다', async () => {
    mockCreate.mockResolvedValueOnce(makeEmptyResponse());

    const { extractFeatures } = await import('./featureExtractor');
    const result = await extractFeatures('뉴스 앱', ['NewsAPI']);

    expect(result.features).toHaveLength(1);
    expect(result.features[0].id).toBe('main-content');
    expect(result.apiUsage).toEqual(['NewsAPI']);
  });

  it('apiNames가 여러 개일 때 fallback apiUsage에 모두 포함된다', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API error'));

    const { extractFeatures } = await import('./featureExtractor');
    const apiNames = ['WeatherAPI', 'GeocodingAPI', 'TimeZoneAPI'];
    const result = await extractFeatures('복잡한 앱', apiNames);

    expect(result.apiUsage).toEqual(apiNames);
  });

  it('올바른 모델과 tool_choice로 Anthropic API를 호출한다', async () => {
    const spec: FeatureSpec = {
      features: [{ id: 'test', description: '테스트', verifiableBy: 'unknown' }],
      stateNeeds: [],
      apiUsage: [],
    };

    mockCreate.mockResolvedValueOnce(makeToolUseResponse(spec));

    const { extractFeatures } = await import('./featureExtractor');
    await extractFeatures('테스트 앱', ['TestAPI']);

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0] as {
      model: string;
      tool_choice: { type: string; name: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(callArgs.model).toBe('claude-haiku-4-5');
    expect(callArgs.tool_choice).toEqual({ type: 'tool', name: 'extract_features' });
    expect(callArgs.messages[0].content).toContain('테스트 앱');
    expect(callArgs.messages[0].content).toContain('TestAPI');
  });
});
