import type { IAiProvider } from './IAiProvider';
import { ClaudeProvider } from './ClaudeProvider';

export type AiProviderType = 'claude';
export type AiTaskType = 'generation' | 'suggestion';

const DEFAULT_MODEL = 'claude-sonnet-4-6-20250514';

export class AiProviderFactory {
  private static providers = new Map<string, IAiProvider>();

  static create(type?: AiProviderType): IAiProvider {
    // AI_PROVIDER 환경변수는 무시 — Claude 단일 체제
    const providerType: AiProviderType = type ?? 'claude';

    if (this.providers.has(providerType)) {
      return this.providers.get(providerType)!;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

    const model = process.env.CLAUDE_GENERATION_MODEL || DEFAULT_MODEL;
    const provider = new ClaudeProvider(apiKey, model);

    this.providers.set(providerType, provider);
    return provider;
  }

  static createForTask(task: AiTaskType): IAiProvider {
    const cacheKey = `claude:${task}`;
    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey)!;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

    const model = task === 'suggestion'
      ? (process.env.CLAUDE_SUGGESTION_MODEL || DEFAULT_MODEL)
      : (process.env.CLAUDE_GENERATION_MODEL || DEFAULT_MODEL);
    const provider = new ClaudeProvider(apiKey, model);

    this.providers.set(cacheKey, provider);
    return provider;
  }

  static async getBestAvailable(): Promise<IAiProvider> {
    try {
      const provider = this.create('claude');
      const { available } = await provider.checkAvailability();
      if (available) return provider;
    } catch {
      // fall through
    }

    throw new Error('No AI provider available');
  }
}
