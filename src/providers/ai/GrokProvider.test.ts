import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GrokProvider } from './GrokProvider'

// openai SDK mock
vi.mock('openai', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    choices: [{ message: { content: '```html\n<p>test</p>\n```' } }],
    usage: { prompt_tokens: 100, completion_tokens: 200 },
  })

  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  }
})

describe('GrokProvider', () => {
  let provider: GrokProvider
  let mockCreate: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    provider = new GrokProvider('test-api-key')
    const OpenAI = (await import('openai')).default
    const instance = (OpenAI as ReturnType<typeof vi.fn>).mock.results[0].value
    mockCreate = instance.chat.completions.create
  })

  it('name이 grok이다', () => {
    expect(provider.name).toBe('grok')
  })

  it('기본 model이 grok-3-mini이다', () => {
    expect(provider.model).toBe('grok-3-mini')
  })

  it('커스텀 모델을 지정할 수 있다', () => {
    const p = new GrokProvider('key', 'grok-3')
    expect(p.model).toBe('grok-3')
  })

  describe('generateCode()', () => {
    it('AI 응답 내용을 content로 반환한다', async () => {
      const result = await provider.generateCode({ system: 'sys', user: 'user' })
      expect(result.content).toBe('```html\n<p>test</p>\n```')
    })

    it('provider 이름이 grok이다', async () => {
      const result = await provider.generateCode({ system: 'sys', user: 'user' })
      expect(result.provider).toBe('grok')
    })

    it('token 사용량을 반환한다', async () => {
      const result = await provider.generateCode({ system: 'sys', user: 'user' })
      expect(result.tokensUsed.input).toBe(100)
      expect(result.tokensUsed.output).toBe(200)
    })

    it('durationMs가 0 이상이다', async () => {
      const result = await provider.generateCode({ system: 'sys', user: 'user' })
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('API 에러 시 에러를 전파한다', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API 호출 실패'))
      await expect(provider.generateCode({ system: 'sys', user: 'user' })).rejects.toThrow('API 호출 실패')
    })

    it('기본 temperature는 0.7이다', async () => {
      await provider.generateCode({ system: 'sys', user: 'user' })
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.7 })
      )
    })

    it('기본 max_tokens는 8192이다', async () => {
      await provider.generateCode({ system: 'sys', user: 'user' })
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 8192 })
      )
    })
  })

  describe('checkAvailability()', () => {
    it('API 성공 시 available: true를 반환한다', async () => {
      const result = await provider.checkAvailability()
      expect(result.available).toBe(true)
    })

    it('429 에러 시 available: false, remainingQuota: 0을 반환한다', async () => {
      mockCreate.mockRejectedValueOnce({ status: 429 })
      const result = await provider.checkAvailability()
      expect(result.available).toBe(false)
      expect(result.remainingQuota).toBe(0)
    })

    it('기타 에러 시 available: false를 반환한다', async () => {
      mockCreate.mockRejectedValueOnce(new Error('network error'))
      const result = await provider.checkAvailability()
      expect(result.available).toBe(false)
    })
  })
})
