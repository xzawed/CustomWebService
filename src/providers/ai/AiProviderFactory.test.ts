import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AiProviderFactory } from './AiProviderFactory';
import { GrokProvider } from './GrokProvider';
import { ClaudeProvider } from './ClaudeProvider';

// GrokProvider mock
vi.mock('./GrokProvider', () => ({
  GrokProvider: vi.fn().mockImplementation(() => ({
    name: 'grok',
    model: 'grok-4',
    generateCode: vi.fn(),
    generateCodeStream: vi.fn(),
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
  })),
}));

// ClaudeProvider mock
vi.mock('./ClaudeProvider', () => ({
  ClaudeProvider: vi.fn().mockImplementation((_apiKey: string, model?: string) => ({
    name: 'claude',
    model: model ?? 'claude-sonnet-4-6',
    generateCode: vi.fn(),
    generateCodeStream: vi.fn(),
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
  })),
}));

describe('AiProviderFactory.create()', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // 싱글톤 캐시 초기화 (private static 접근)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (AiProviderFactory as any).providers = new Map();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('ANTHROPIC_API_KEY 없으면 claude 생성 시 에러를 던진다', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => AiProviderFactory.create('claude')).toThrow('ANTHROPIC_API_KEY is not set');
  });

  it('ANTHROPIC_API_KEY 있으면 ClaudeProvider를 반환한다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const provider = AiProviderFactory.create('claude');
    expect(provider.name).toBe('claude');
    expect(ClaudeProvider).toHaveBeenCalledWith('test-key');
  });

  it('XAI_API_KEY 없으면 grok 생성 시 에러를 던진다', () => {
    delete process.env.XAI_API_KEY;
    expect(() => AiProviderFactory.create('grok')).toThrow('XAI_API_KEY is not set');
  });

  it('XAI_API_KEY 있으면 GrokProvider를 반환한다', () => {
    process.env.XAI_API_KEY = 'test-key';
    const provider = AiProviderFactory.create('grok');
    expect(provider.name).toBe('grok');
    expect(GrokProvider).toHaveBeenCalledWith('test-key');
  });

  it('같은 provider 타입은 싱글톤으로 반환된다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const p1 = AiProviderFactory.create('claude');
    const p2 = AiProviderFactory.create('claude');
    expect(p1).toBe(p2);
  });

  it('알 수 없는 provider 타입은 에러를 던진다', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => AiProviderFactory.create('unknown' as any)).toThrow('Unknown AI provider');
  });

  it('기본 provider가 claude이다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.AI_PROVIDER;
    const provider = AiProviderFactory.create();
    expect(provider.name).toBe('claude');
  });

  it('AI_PROVIDER 환경변수로 기본 타입을 지정할 수 있다', () => {
    process.env.XAI_API_KEY = 'test-key';
    process.env.AI_PROVIDER = 'grok';
    const provider = AiProviderFactory.create();
    expect(provider.name).toBe('grok');
  });
});

describe('AiProviderFactory.createForTask()', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (AiProviderFactory as any).providers = new Map();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('generation 태스크는 Sonnet 모델을 사용한다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.AI_PROVIDER;
    const provider = AiProviderFactory.createForTask('generation');
    expect(provider.model).toBe('claude-sonnet-4-6');
  });

  it('suggestion 태스크는 Haiku 모델을 사용한다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.AI_PROVIDER;
    const provider = AiProviderFactory.createForTask('suggestion');
    expect(provider.model).toBe('claude-haiku-4-5');
  });

  it('같은 태스크는 싱글톤으로 반환된다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.AI_PROVIDER;
    const p1 = AiProviderFactory.createForTask('generation');
    const p2 = AiProviderFactory.createForTask('generation');
    expect(p1).toBe(p2);
  });

  it('다른 태스크는 다른 인스턴스를 반환한다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.AI_PROVIDER;
    const p1 = AiProviderFactory.createForTask('generation');
    const p2 = AiProviderFactory.createForTask('suggestion');
    expect(p1).not.toBe(p2);
  });

  it('grok provider일 때 태스크 구분 없이 동일 인스턴스를 반환한다', () => {
    process.env.XAI_API_KEY = 'test-key';
    process.env.AI_PROVIDER = 'grok';
    const p1 = AiProviderFactory.createForTask('generation');
    const p2 = AiProviderFactory.createForTask('suggestion');
    expect(p1).toBe(p2);
  });

  it('ANTHROPIC_API_KEY 없으면 에러를 던진다', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_PROVIDER;
    expect(() => AiProviderFactory.createForTask('generation')).toThrow('ANTHROPIC_API_KEY is not set');
  });
});

describe('AiProviderFactory.getBestAvailable()', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ANTHROPIC_API_KEY = 'test-key';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (AiProviderFactory as any).providers = new Map();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('사용 가능한 provider가 있으면 반환한다', async () => {
    const provider = await AiProviderFactory.getBestAvailable();
    expect(provider.name).toBe('claude');
  });

  it('모든 provider가 불가능하면 에러를 던진다', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.XAI_API_KEY;
    await expect(AiProviderFactory.getBestAvailable()).rejects.toThrow('No AI provider available');
  });
});
