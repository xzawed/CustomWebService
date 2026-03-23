import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AiProviderFactory } from './AiProviderFactory'
import { GrokProvider } from './GrokProvider'

// GrokProvider mock
vi.mock('./GrokProvider', () => ({
  GrokProvider: vi.fn().mockImplementation(() => ({
    name: 'grok',
    model: 'grok-3-mini',
    generateCode: vi.fn(),
    generateCodeStream: vi.fn(),
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
  })),
}))

describe('AiProviderFactory.create()', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    // 싱글톤 캐시 초기화 (private static 접근)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(AiProviderFactory as any).providers = new Map()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('XAI_API_KEY 없으면 에러를 던진다', () => {
    delete process.env.XAI_API_KEY
    expect(() => AiProviderFactory.create('grok')).toThrow('XAI_API_KEY is not set')
  })

  it('XAI_API_KEY 있으면 GrokProvider를 반환한다', () => {
    process.env.XAI_API_KEY = 'test-key'
    const provider = AiProviderFactory.create('grok')
    expect(provider.name).toBe('grok')
    expect(GrokProvider).toHaveBeenCalledWith('test-key')
  })

  it('같은 provider 타입은 싱글톤으로 반환된다', () => {
    process.env.XAI_API_KEY = 'test-key'
    const p1 = AiProviderFactory.create('grok')
    const p2 = AiProviderFactory.create('grok')
    // 같은 인스턴스 참조 = 싱글톤 확인
    expect(p1).toBe(p2)
  })

  it('알 수 없는 provider 타입은 에러를 던진다', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => AiProviderFactory.create('unknown' as any)).toThrow('Unknown AI provider')
  })

  it('AI_PROVIDER 환경변수로 기본 타입을 지정할 수 있다', () => {
    process.env.XAI_API_KEY = 'test-key'
    process.env.AI_PROVIDER = 'grok'
    const provider = AiProviderFactory.create()
    expect(provider.name).toBe('grok')
  })
})

describe('AiProviderFactory.getBestAvailable()', () => {
  beforeEach(() => {
    process.env.XAI_API_KEY = 'test-key'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(AiProviderFactory as any).providers = new Map()
  })

  it('사용 가능한 provider가 있으면 반환한다', async () => {
    const provider = await AiProviderFactory.getBestAvailable()
    expect(provider.name).toBe('grok')
  })

  it('모든 provider가 불가능하면 에러를 던진다', async () => {
    delete process.env.XAI_API_KEY
    await expect(AiProviderFactory.getBestAvailable()).rejects.toThrow('No AI provider available')
  })
})
