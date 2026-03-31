import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeProvider } from './ClaudeProvider';

// Anthropic SDK mock
const mockCreate = vi.fn();
const mockStreamOn = vi.fn();
const mockFinalMessage = vi.fn();

const mockStream = vi.fn().mockReturnValue({
  on: mockStreamOn,
  finalMessage: mockFinalMessage,
});

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
        stream: mockStream,
      },
    })),
  };
});

function makeSuccessResponse(text = '```html\n<p>test</p>\n```') {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 150, output_tokens: 300 },
  };
}

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue(makeSuccessResponse());
    mockFinalMessage.mockResolvedValue({
      usage: { input_tokens: 150, output_tokens: 300 },
    });
    mockStreamOn.mockImplementation(() => {});
    provider = new ClaudeProvider('test-api-key');
  });

  // ── 기본 속성 ──────────────────────────────────
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

  // ── generateCode() ─────────────────────────────
  describe('generateCode()', () => {
    it('AI 응답 내용을 content로 반환한다', async () => {
      const result = await provider.generateCode({ system: 'sys', user: 'user' });
      expect(result.content).toBe('```html\n<p>test</p>\n```');
    });

    it('provider와 model 정보를 반환한다', async () => {
      const result = await provider.generateCode({ system: 'sys', user: 'user' });
      expect(result.provider).toBe('claude');
      expect(result.model).toBe('claude-sonnet-4-6');
    });

    it('token 사용량을 반환한다', async () => {
      const result = await provider.generateCode({ system: 'sys', user: 'user' });
      expect(result.tokensUsed).toEqual({ input: 150, output: 300 });
    });

    it('durationMs가 0 이상이다', async () => {
      const result = await provider.generateCode({ system: 'sys', user: 'user' });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('system 프롬프트를 top-level 필드로 전달한다', async () => {
      await provider.generateCode({ system: 'test-system', user: 'test-user' });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'test-system',
          messages: [{ role: 'user', content: 'test-user' }],
        })
      );
    });

    it('기본 temperature는 0.7이다', async () => {
      await provider.generateCode({ system: 'sys', user: 'user' });
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.7 }));
    });

    it('기본 max_tokens는 32000이다', async () => {
      await provider.generateCode({ system: 'sys', user: 'user' });
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 32000 }));
    });

    // ── 커스텀 파라미터 ──
    it('커스텀 temperature를 전달한다', async () => {
      await provider.generateCode({ system: 'sys', user: 'user', temperature: 0.3 });
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.3 }));
    });

    it('커스텀 maxTokens를 전달한다', async () => {
      await provider.generateCode({ system: 'sys', user: 'user', maxTokens: 600 });
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 600 }));
    });

    it('suggest-context와 동일한 파라미터로 호출한다 (temperature:0.8, maxTokens:600)', async () => {
      await provider.generateCode({
        system: '당신은 웹 서비스 아이디어를 제안하는 도우미입니다.',
        user: '선택된 API:\n- Weather API: 날씨 정보 제공\n\n아이디어 3가지를 JSON 배열로 제안해주세요.',
        temperature: 0.8,
        maxTokens: 600,
      });
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-6',
        system: '당신은 웹 서비스 아이디어를 제안하는 도우미입니다.',
        messages: [{ role: 'user', content: expect.stringContaining('Weather API') }],
        temperature: 0.8,
        max_tokens: 600,
      });
    });

    // ── Haiku 모델 호출 ──
    it('Haiku 모델로 suggestion 호출이 정상 동작한다', async () => {
      const haiku = new ClaudeProvider('key', 'claude-haiku-4-5');
      await haiku.generateCode({ system: 'sys', user: 'user', maxTokens: 600 });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5',
          max_tokens: 600,
        })
      );
    });

    // ── 응답 처리 엣지 케이스 ──
    it('빈 content 배열 시 빈 문자열을 반환한다', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [],
        usage: { input_tokens: 10, output_tokens: 0 },
      });
      const result = await provider.generateCode({ system: 'sys', user: 'user' });
      expect(result.content).toBe('');
    });

    it('thinking 블록이 포함된 응답에서 text만 추출한다', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          { type: 'thinking', thinking: 'reasoning...' },
          { type: 'text', text: 'actual response' },
        ],
        usage: { input_tokens: 50, output_tokens: 100 },
      });
      const result = await provider.generateCode({ system: 'sys', user: 'user' });
      expect(result.content).toBe('actual response');
    });

    it('JSON 배열 응답을 올바르게 반환한다 (suggest-context 시나리오)', async () => {
      const jsonResponse = '["날씨 대시보드를 만들고 싶어요", "일기예보 알림 서비스", "여행 날씨 플래너"]';
      mockCreate.mockResolvedValueOnce(makeSuccessResponse(jsonResponse));
      const result = await provider.generateCode({ system: 'sys', user: 'user' });
      expect(result.content).toBe(jsonResponse);
      const parsed = JSON.parse(result.content);
      expect(parsed).toHaveLength(3);
    });

    // ── 에러 처리 ──
    it('비재시도 에러 시 즉시 전파한다', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API 호출 실패'));
      await expect(provider.generateCode({ system: 'sys', user: 'user' })).rejects.toThrow('API 호출 실패');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('400 에러(invalid_request)는 재시도하지 않는다', async () => {
      const error400 = Object.assign(new Error('invalid_request_error'), { status: 400 });
      mockCreate.mockRejectedValue(error400);
      await expect(provider.generateCode({ system: 'sys', user: 'user' })).rejects.toThrow();
      expect(mockCreate).toHaveBeenCalledTimes(1); // 재시도 없이 1번만 호출
    });

    it('429 에러는 최대 2회 재시도한다', async () => {
      const error429 = Object.assign(new Error('rate limited'), { status: 429 });
      mockCreate.mockRejectedValue(error429);
      await expect(provider.generateCode({ system: 'sys', user: 'user' })).rejects.toThrow();
      expect(mockCreate).toHaveBeenCalledTimes(3); // 원본 + 2회 재시도
    });

    it('500 에러는 최대 2회 재시도한다', async () => {
      const error500 = Object.assign(new Error('server error'), { status: 500 });
      mockCreate.mockRejectedValue(error500);
      await expect(provider.generateCode({ system: 'sys', user: 'user' })).rejects.toThrow();
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('재시도 중 성공하면 결과를 반환한다', async () => {
      const error502 = Object.assign(new Error('bad gateway'), { status: 502 });
      mockCreate
        .mockRejectedValueOnce(error502)
        .mockResolvedValueOnce(makeSuccessResponse('recovered'));
      const result = await provider.generateCode({ system: 'sys', user: 'user' });
      expect(result.content).toBe('recovered');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('네트워크 에러는 재시도한다', async () => {
      const fetchError = Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
      mockCreate.mockRejectedValue(fetchError);
      await expect(provider.generateCode({ system: 'sys', user: 'user' })).rejects.toThrow();
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });
  });

  // ── generateCodeStream() ───────────────────────
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
      expect(result.tokensUsed).toEqual({ input: 150, output: 300 });
    });

    it('provider와 model 정보를 반환한다', async () => {
      const result = await provider.generateCodeStream(
        { system: 'sys', user: 'user' },
        () => {}
      );
      expect(result.provider).toBe('claude');
      expect(result.model).toBe('claude-sonnet-4-6');
    });

    it('stream에 올바른 파라미터를 전달한다', async () => {
      await provider.generateCodeStream({ system: 'sys', user: 'user' }, () => {});
      expect(mockStream).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-6',
        system: 'sys',
        messages: [{ role: 'user', content: 'user' }],
        temperature: 0.7,
        max_tokens: 32000,
      });
    });

    it('커스텀 파라미터로 스트리밍한다', async () => {
      await provider.generateCodeStream(
        { system: 'sys', user: 'user', temperature: 0.5, maxTokens: 16000 },
        () => {}
      );
      expect(mockStream).toHaveBeenCalledWith(expect.objectContaining({
        temperature: 0.5,
        max_tokens: 16000,
      }));
    });

    it('빈 스트림도 정상 처리한다', async () => {
      mockStreamOn.mockImplementation(() => {});
      const result = await provider.generateCodeStream(
        { system: 'sys', user: 'user' },
        () => {}
      );
      expect(result.content).toBe('');
    });

    it('긴 HTML 스트림을 정상 누적한다', async () => {
      const htmlChunks = ['<!DOCTYPE html>', '<html>', '<head>', '</head>', '<body>', '<p>Hello</p>', '</body>', '</html>'];
      mockStreamOn.mockImplementation((event: string, callback: (text: string) => void) => {
        if (event === 'text') {
          htmlChunks.forEach(c => callback(c));
        }
      });

      const result = await provider.generateCodeStream(
        { system: 'sys', user: 'user' },
        () => {}
      );
      expect(result.content).toBe(htmlChunks.join(''));
    });

    it('스트림 에러 시 재시도한다 (502)', async () => {
      const error502 = Object.assign(new Error('bad gateway'), { status: 502 });
      mockStream
        .mockImplementationOnce(() => { throw error502; })
        .mockReturnValueOnce({ on: mockStreamOn, finalMessage: mockFinalMessage });

      const result = await provider.generateCodeStream(
        { system: 'sys', user: 'user' },
        () => {}
      );
      expect(result.provider).toBe('claude');
      expect(mockStream).toHaveBeenCalledTimes(2);
    });
  });

  // ── checkAvailability() ────────────────────────
  describe('checkAvailability()', () => {
    it('API 성공 시 available: true를 반환한다', async () => {
      const result = await provider.checkAvailability();
      expect(result.available).toBe(true);
    });

    it('max_tokens: 1로 최소 토큰만 사용한다', async () => {
      await provider.checkAvailability();
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 1 }));
    });

    it('429 에러 시 available: false, remainingQuota: 0을 반환한다', async () => {
      mockCreate.mockRejectedValueOnce({ status: 429 });
      const result = await provider.checkAvailability();
      expect(result).toEqual({ available: false, remainingQuota: 0 });
    });

    it('401 에러 시 available: false를 반환한다 (API 키 오류)', async () => {
      mockCreate.mockRejectedValueOnce({ status: 401 });
      const result = await provider.checkAvailability();
      expect(result).toEqual({ available: false });
    });

    it('네트워크 에러 시 available: false를 반환한다', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'));
      const result = await provider.checkAvailability();
      expect(result).toEqual({ available: false });
    });
  });

  // ── API 파라미터 무결성 (다양한 실제 시나리오) ──
  describe('API 파라미터 무결성', () => {
    it('한국어 시스템 프롬프트를 올바르게 전달한다', async () => {
      const koreanSystem = '당신은 웹 서비스 아이디어를 제안하는 도우미입니다.\n규칙:\n- 한국어로 작성';
      await provider.generateCode({ system: koreanSystem, user: '테스트' });
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ system: koreanSystem }));
    });

    it('매우 긴 시스템 프롬프트도 정상 전달한다 (312줄 프롬프트 시뮬레이션)', async () => {
      const longPrompt = Array.from({ length: 312 }, (_, i) => `규칙 ${i + 1}: 내용`).join('\n');
      await provider.generateCode({ system: longPrompt, user: 'user' });
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ system: longPrompt }));
    });

    it('API 1개만 포함된 짧은 user 프롬프트도 정상 전달한다', async () => {
      const shortUser = '선택된 API:\n- Weather API: 날씨 조회\n\n아이디어 3가지를 제안해주세요.';
      await provider.generateCode({ system: 'sys', user: shortUser, temperature: 0.8, maxTokens: 600 });
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        messages: [{ role: 'user', content: shortUser }],
        temperature: 0.8,
        max_tokens: 600,
      }));
    });

    it('model 필드가 정확히 전달된다 (Haiku)', async () => {
      const haiku = new ClaudeProvider('key', 'claude-haiku-4-5');
      await haiku.generateCode({ system: 's', user: 'u' });
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku-4-5' }));
    });

    it('model 필드가 정확히 전달된다 (Sonnet)', async () => {
      await provider.generateCode({ system: 's', user: 'u' });
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-4-6' }));
    });
  });
});
