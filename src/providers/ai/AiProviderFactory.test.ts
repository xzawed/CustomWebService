import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AiProviderFactory } from './AiProviderFactory';
import { ClaudeProvider } from './ClaudeProvider';

// ClaudeProvider mock
vi.mock('./ClaudeProvider', () => ({
  ClaudeProvider: vi.fn().mockImplementation((_apiKey: string, model?: string) => ({
    name: 'claude',
    model: model ?? 'claude-opus-4-6',
    generateCode: vi.fn(),
    generateCodeStream: vi.fn(),
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
  })),
}));

describe('AiProviderFactory.create()', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    AiProviderFactory.clearCache();
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
});

describe('AiProviderFactory.createForTask()', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AiProviderFactory.clearCache();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('generation 태스크는 Opus 모델을 사용한다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.AI_PROVIDER;
    const provider = AiProviderFactory.createForTask('generation');
    expect(provider.model).toBe('claude-opus-4-6');
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

  it('ANTHROPIC_API_KEY 없으면 에러를 던진다', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_PROVIDER;
    expect(() => AiProviderFactory.createForTask('generation')).toThrow('ANTHROPIC_API_KEY is not set');
  });

  it('AI_MODEL_SUGGESTION 설정 시 suggestion 태스크가 해당 모델을 사용한다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.AI_MODEL_SUGGESTION = 'claude-sonnet-4-6';
    const provider = AiProviderFactory.createForTask('suggestion');
    expect(provider.model).toBe('claude-sonnet-4-6');
  });

  it('AI_MODEL_GENERATION 설정 시 generation 태스크가 해당 모델을 사용한다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.AI_MODEL_GENERATION = 'claude-opus-4-6';
    const provider = AiProviderFactory.createForTask('generation');
    expect(provider.model).toBe('claude-opus-4-6');
  });

  it('허용되지 않은 모델 ID 설정 시 기본값으로 폴백한다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.AI_MODEL_SUGGESTION = 'claude-haiku-4-5-20251001';
    const provider = AiProviderFactory.createForTask('suggestion');
    expect(provider.model).toBe('claude-haiku-4-5');
  });

  it('AI_MODEL_SUGGESTION 미설정 시 기본값 Haiku를 사용한다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.AI_MODEL_SUGGESTION;
    const provider = AiProviderFactory.createForTask('suggestion');
    expect(provider.model).toBe('claude-haiku-4-5');
  });

  it('AI_MODEL_GENERATION 미설정 시 기본값 Opus를 사용한다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.AI_MODEL_GENERATION;
    const provider = AiProviderFactory.createForTask('generation');
    expect(provider.model).toBe('claude-opus-4-6');
  });

  it('모델이 다르면 다른 인스턴스를 반환한다', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.AI_MODEL_GENERATION;
    const p1 = AiProviderFactory.createForTask('generation'); // opus (기본값)
    AiProviderFactory.clearCache();
    process.env.AI_MODEL_GENERATION = 'claude-sonnet-4-6';
    const p2 = AiProviderFactory.createForTask('generation'); // sonnet (오버라이드)
    expect(p1.model).not.toBe(p2.model);
  });
});

