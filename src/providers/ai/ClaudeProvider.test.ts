import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeProvider } from './ClaudeProvider';

// Anthropic SDK mock
const mockCreate = vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: '```html\n<p>test</p>\n```' }],
  usage: { input_tokens: 150, output_tokens: 300 },
});

const mockStreamOn = vi.fn();
const mockFinalMessage = vi.fn().mockResolvedValue({
  usage: { input_tokens: 150, output_tokens: 300 },
});

const mockStream = vi.fn().mockReturnValue({
  on: mockStreamOn,
  finalMessage: mockFinalMessage,
});

vi.mock('@anthropic-ai/sdk', () => {
  const RateLimitError = class extends Error {
    status = 429;
    constructor() {
      super('rate limited');
      this.name = 'RateLimitError';
    }
  };
  const InternalServerError = class extends Error {
    status = 500;
    constructor() {
      super('internal error');
      this.name = 'InternalServerError';
    }
  };
  const APIError = class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'APIError';
    }
  };

  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
        stream: mockStream,
      },
    })),
    Anthropic: {
      RateLimitError,
      InternalServerError,
      APIError,
    },
  };
});

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```html\n<p>test</p>\n```' }],
      usage: { input_tokens: 150, output_tokens: 300 },
    });
    mockFinalMessage.mockResolvedValue({
      usage: { input_tokens: 150, output_tokens: 300 },
    });
    provider = new ClaudeProvider('test-api-key');
  });

  it('name이 claude이다', () => {
    expect(provider.name).toBe('claude');
  });

  it('기본 model이 claude-sonnet-4-6이다', () => {
    expect(provider.model).toBe('claude-sonnet-4-6');
  });

  it('커스텀 모델을 지정할 수 있다', () => {
    const p = new ClaudeProvider('key', 'claude-haiku-4-5');
    expect(p.model).toBe('claude-haiku-4-5');
  });

  describe('generateCode()', () => {
    it('AI 응답 내용을 content로 반환한다', async () => {
      const result = await provider.generateCode({ system: 'sys', user: 'user' });
      expect(result.content).toBe('```html\n<p>test</p>\n```');
    });

    it('provider 이름이 claude이다', async () => {
      const result = await provider.generateCode({ system: 'sys', user: 'user' });
      expect(result.provider).toBe('claude');
    });

    it('token 사용량을 반환한다', async () => {
      const result = await provider.generateCode({ system: 'sys', user: 'user' });
      expect(result.tokensUsed.input).toBe(150);
      expect(result.tokensUsed.output).toBe(300);
    });

    it('durationMs가 0 이상이다', async () => {
      const result = await provider.generateCode({ system: 'sys', user: 'user' });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('API 에러 시 에러를 전파한다', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API 호출 실패'));
      await expect(provider.generateCode({ system: 'sys', user: 'user' })).rejects.toThrow(
        'API 호출 실패'
      );
    });

    it('기본 temperature는 0.7이다', async () => {
      await provider.generateCode({ system: 'sys', user: 'user' });
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.7 }));
    });

    it('기본 max_tokens는 48000이다', async () => {
      await provider.generateCode({ system: 'sys', user: 'user' });
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 48000 }));
    });

    it('system 프롬프트를 cache_control 포함 배열로 전달한다', async () => {
      await provider.generateCode({ system: 'test-system', user: 'test-user' });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: [
            {
              type: 'text',
              text: 'test-system',
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: 'test-user' }],
        })
      );
    });

    it('extendedThinking 활성화 시 thinking 파라미터와 temperature 1이 전달된다', async () => {
      await provider.generateCode({ system: 'sys', user: 'user', extendedThinking: true });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          thinking: { type: 'enabled', budget_tokens: 10000 },
          temperature: 1,
        })
      );
    });

    it('extendedThinking 비활성화 시 기본 temperature 0.7이 전달된다', async () => {
      await provider.generateCode({ system: 'sys', user: 'user' });
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.7 }));
    });
  });

  describe('generateCodeStream()', () => {
    it('스트리밍 응답을 누적하여 반환한다', async () => {
      mockStreamOn.mockImplementation((event: string, callback: (text: string) => void) => {
        if (event === 'text') {
          callback('chunk1');
          callback('chunk2');
        }
      });

      const chunks: string[] = [];
      const result = await provider.generateCodeStream(
        { system: 'sys', user: 'user' },
        (chunk) => { chunks.push(chunk); }
      );

      expect(chunks).toEqual(['chunk1', 'chunk2']);
      expect(result.content).toBe('chunk1chunk2');
      expect(result.tokensUsed.input).toBe(150);
      expect(result.tokensUsed.output).toBe(300);
    });

    it('provider와 model 정보를 반환한다', async () => {
      mockStreamOn.mockImplementation(() => {});

      const result = await provider.generateCodeStream(
        { system: 'sys', user: 'user' },
        () => {}
      );

      expect(result.provider).toBe('claude');
      expect(result.model).toBe('claude-sonnet-4-6');
    });
  });

  describe('checkAvailability()', () => {
    it('API 성공 시 available: true를 반환한다', async () => {
      const result = await provider.checkAvailability();
      expect(result.available).toBe(true);
    });

    it('429 에러 시 available: false, remainingQuota: 0을 반환한다', async () => {
      mockCreate.mockRejectedValueOnce({ status: 429 });
      const result = await provider.checkAvailability();
      expect(result.available).toBe(false);
      expect(result.remainingQuota).toBe(0);
    });

    it('기타 에러 시 available: false를 반환한다', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'));
      const result = await provider.checkAvailability();
      expect(result.available).toBe(false);
    });
  });
});
