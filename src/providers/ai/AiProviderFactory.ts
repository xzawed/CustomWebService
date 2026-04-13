import type { IAiProvider } from './IAiProvider';
import { ClaudeProvider } from './ClaudeProvider';

export type AiProviderType = 'claude';
export type AiTaskType = 'generation' | 'suggestion';

export class AiProviderFactory {
  private static providers = new Map<string, IAiProvider>();

  static create(type?: AiProviderType): IAiProvider {
    const providerType = type ?? (process.env.AI_PROVIDER as AiProviderType) ?? 'claude';

    if (this.providers.has(providerType)) {
      return this.providers.get(providerType)!;
    }

    if (providerType !== 'claude') {
      throw new Error(`Unknown AI provider: ${providerType}`);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

    const provider = new ClaudeProvider(apiKey);
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

    const model = task === 'suggestion' ? 'claude-haiku-4-5' : 'claude-sonnet-4-6';
    const provider = new ClaudeProvider(apiKey, model);

    this.providers.set(cacheKey, provider);
    return provider;
  }
}
