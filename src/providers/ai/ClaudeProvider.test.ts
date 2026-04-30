import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    default: vi.fn(function() {
      return {
        messages: {
          create: mockCreate,
          stream: mockStream,
        },
      };
    }),
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

    it('temperature를 API에 전달하지 않는다 (Claude 4.x deprecated)', async () => {
      await provider.generateCode({ system: 'sys', user: 'user' });
      const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty('temperature');
    });

    it('기본 max_tokens는 48000이다', async () => {
      await provider.generateCode({ system: 'sys', user: 'user' });
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 48000 }));
    });

    it('system 프롬프트를 cache_control 블록 배열로 전달한다', async () => {
      await provider.generateCode({ system: 'test-system', user: 'test-user' });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: [{ type: 'text', text: 'test-system', cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: 'test-user' }],
        })
      );
    });

    it('extendedThinking 활성화 시 thinking 파라미터가 전달된다', async () => {
      await provider.generateCode({ system: 'sys', user: 'user', extendedThinking: true });
      const callArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg).toMatchObject({
        thinking: { type: 'enabled', budget_tokens: 32000 },
      });
      expect(callArg).not.toHaveProperty('temperature');
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

  describe('withRetry — 재시도 동작', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('429 Retry-After 헤더가 있으면 해당 시간 후 재시도한다', async () => {
      mockCreate
        .mockRejectedValueOnce({ status: 429, headers: { 'retry-after': '3' } })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'ok after retry-after' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });

      // 2999ms — 아직 재시도 안 됨 (retry-after: 3초)
      await vi.advanceTimersByTimeAsync(2999);
      expect(mockCreate).toHaveBeenCalledTimes(1);

      // 1ms 더 — 3000ms 도달, 재시도 실행
      await vi.advanceTimersByTimeAsync(1);
      expect(mockCreate).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result.content).toBe('ok after retry-after');
    });

    it('429 Retry-After 헤더가 없으면 기존 지수 백오프(1000ms)를 사용한다', async () => {
      mockCreate
        .mockRejectedValueOnce({ status: 429 }) // headers 없음
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'ok fallback backoff' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });

      // 999ms — 아직 재시도 안 됨
      await vi.advanceTimersByTimeAsync(999);
      expect(mockCreate).toHaveBeenCalledTimes(1);

      // 1ms 더 — 1000ms, 재시도
      await vi.advanceTimersByTimeAsync(1);
      expect(mockCreate).toHaveBeenCalledTimes(2);

      await promise;
    });

    it('첫 시도 성공 → 1회 호출, 정상 반환', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'success' }],
        usage: { input_tokens: 10, output_tokens: 10 },
      });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(result.content).toBe('success');
    });

    it('429 에러 → 재시도 후 성공 (총 2회 호출)', async () => {
      mockCreate
        .mockRejectedValueOnce({ status: 429, name: 'RateLimitError' })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'retry success' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('retry success');
    });

    it('500 서버 에러 → 재시도 후 성공', async () => {
      mockCreate
        .mockRejectedValueOnce({ status: 500, name: 'InternalServerError' })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'ok after 500' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('ok after 500');
    });

    it('503 에러 → 재시도 후 성공', async () => {
      mockCreate
        .mockRejectedValueOnce({ status: 503 })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'ok after 503' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      await vi.runAllTimersAsync();
      await promise;

      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('MAX_RETRIES(2) 초과 → 최종 에러 throw', async () => {
      const retryableError = { status: 429, name: 'RateLimitError' };
      mockCreate
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError);

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      // rejection handler를 타이머 실행 전에 먼저 연결해 unhandled rejection 방지
      const assertRejection = expect(promise).rejects.toMatchObject({ status: 429 });
      await vi.runAllTimersAsync();
      await assertRejection;

      expect(mockCreate).toHaveBeenCalledTimes(3); // 초기 1회 + 재시도 2회
    });

    it('4xx (400) 에러 → 즉시 throw (재시도 없음)', async () => {
      mockCreate.mockRejectedValueOnce({ status: 400, name: 'BadRequestError' });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      const assertRejection = expect(promise).rejects.toMatchObject({ status: 400 });
      await vi.runAllTimersAsync();
      await assertRejection;

      expect(mockCreate).toHaveBeenCalledTimes(1); // 재시도 없음
    });

    it('401 에러 → 즉시 throw (재시도 없음)', async () => {
      mockCreate.mockRejectedValueOnce({ status: 401, name: 'AuthError' });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      const assertRejection = expect(promise).rejects.toMatchObject({ status: 401 });
      await vi.runAllTimersAsync();
      await assertRejection;

      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('추가 재시도 시나리오', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('502 Bad Gateway → 재시도 후 성공', async () => {
      mockCreate
        .mockRejectedValueOnce({ status: 502 })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'ok after 502' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('ok after 502');
    });

    it('504 Gateway Timeout → 재시도 후 성공', async () => {
      mockCreate
        .mockRejectedValueOnce({ status: 504 })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'ok after 504' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('ok after 504');
    });

    it('네트워크 에러 ECONNRESET → 재시도 후 성공', async () => {
      const networkError = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      mockCreate
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'ok after ECONNRESET' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('ok after ECONNRESET');
    });

    it('네트워크 에러 ETIMEDOUT → 재시도 후 성공', async () => {
      const networkError = Object.assign(new Error('connection timed out'), { code: 'ETIMEDOUT' });
      mockCreate
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'ok after ETIMEDOUT' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('ok after ETIMEDOUT');
    });

    it('지수 백오프: 1차 1000ms, 2차 2000ms 대기', async () => {
      const retryableError = { status: 500 };
      mockCreate
        .mockRejectedValueOnce(retryableError) // attempt 0 → 실패
        .mockRejectedValueOnce(retryableError) // attempt 1 (1000ms 후) → 실패
        .mockResolvedValueOnce({               // attempt 2 (2000ms 후) → 성공
          content: [{ type: 'text', text: 'ok after backoff' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });

      // 999ms 진행 — 1차 재시도 아직 실행 안 됨
      await vi.advanceTimersByTimeAsync(999);
      expect(mockCreate).toHaveBeenCalledTimes(1);

      // 1000ms 진행 — 1차 재시도 실행
      await vi.advanceTimersByTimeAsync(1);
      expect(mockCreate).toHaveBeenCalledTimes(2);

      // 추가 1999ms 진행 — 2차 재시도 아직 안 됨 (총 2999ms)
      await vi.advanceTimersByTimeAsync(1999);
      expect(mockCreate).toHaveBeenCalledTimes(2);

      // 1ms 더 진행 — 2차 재시도 실행 (총 3000ms = 1000+2000)
      await vi.advanceTimersByTimeAsync(1);
      expect(mockCreate).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result.content).toBe('ok after backoff');
    });

    it('MAX_RETRIES 초과 후 마지막 에러를 throw', async () => {
      const err502 = { status: 502, message: 'bad gateway' };
      mockCreate
        .mockRejectedValueOnce(err502)
        .mockRejectedValueOnce(err502)
        .mockRejectedValueOnce(err502);

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      const assertRejection = expect(promise).rejects.toMatchObject({ status: 502 });
      await vi.runAllTimersAsync();
      await assertRejection;

      expect(mockCreate).toHaveBeenCalledTimes(3); // 초기 1회 + 재시도 2회
    });

    it('4xx (400) 에러 → 즉시 throw — 재시도 없음 (추가 검증)', async () => {
      // 기존 테스트 보완: 400은 RETRYABLE_STATUS_CODES에 없으므로 즉시 throw
      mockCreate
        .mockRejectedValueOnce({ status: 400, message: 'bad request' })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'should not reach' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      const assertRejection = expect(promise).rejects.toMatchObject({ status: 400 });
      await vi.runAllTimersAsync();
      await assertRejection;

      // 재시도 없이 1회만 호출
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('generateCodeStream 성공 후 finalMessage 실패 → 에러 전파', async () => {
      // finalMessage 에러는 status/code 없는 일반 Error → isRetryableError false → 즉시 throw
      mockStreamOn.mockImplementation((event: string, callback: (text: string) => void) => {
        if (event === 'text') {
          callback('partial content');
        }
      });
      mockFinalMessage.mockRejectedValueOnce(new Error('finalMessage network error'));

      await expect(
        provider.generateCodeStream({ system: 'sys', user: 'user' }, () => {})
      ).rejects.toThrow('finalMessage network error');
    });

    it('재시도 중 첫 번째 성공 시 즉시 반환 (나머지 시도 없음)', async () => {
      // 503 → sleep(1000ms) → 성공 → 이후 추가 시도 없이 종료
      // mockReset으로 이전 테스트의 잔여 Once 큐를 완전히 비우고 재설정
      mockCreate.mockReset();
      mockCreate
        .mockRejectedValueOnce({ status: 503 })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'first success' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      await vi.runAllTimersAsync();
      const result = await promise;

      // 총 2회만 호출 (3번째 시도 없이 종료)
      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('first success');
    });

    it('status 없는 일반 Error → 재시도 (network error 취급)', async () => {
      // isRetryableError: status 없는 Error 중 'code' 속성이 있으면 재시도
      // mockReset으로 이전 테스트의 잔여 Once 큐를 완전히 비우고 재설정
      mockCreate.mockReset();
      const plainNetworkError = Object.assign(new Error('fetch failed'), { code: 'ENOTFOUND' });
      mockCreate
        .mockRejectedValueOnce(plainNetworkError)
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'ok after plain error' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });

      const promise = provider.generateCode({ system: 'sys', user: 'user' });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('ok after plain error');
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
