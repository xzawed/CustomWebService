import type { IAiProvider } from './IAiProvider';
import { GrokProvider } from './GrokProvider';
import { ClaudeProvider } from './ClaudeProvider';

export type AiProviderType = 'grok' | 'openai' | 'ollama' | 'claude';
export type AiTaskType = 'generation' | 'suggestion';

export class AiProviderFactory {
  private static providers = new Map<string, IAiProvider>();

  static create(type?: AiProviderType): IAiProvider {
    const providerType = type ?? (process.env.AI_PROVIDER as AiProviderType) ?? 'claude';

    if (this.providers.has(providerType)) {
      return this.providers.get(providerType)!;
    }

    let provider: IAiProvider;

    switch (providerType) {
      case 'claude': {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
        provider = new ClaudeProvider(apiKey);
        break;
      }
      case 'grok': {
        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) throw new Error('XAI_API_KEY is not set');
        provider = new GrokProvider(apiKey);
        break;
      }
      // Future providers:
      // case 'openai': provider = new OpenAiProvider(...); break;
      // case 'ollama': provider = new OllamaProvider(...); break;
      default:
        throw new Error(`Unknown AI provider: ${providerType}`);
    }

    this.providers.set(providerType, provider);
    return provider;
  }

  static createForTask(task: AiTaskType): IAiProvider {
    const providerType = (process.env.AI_PROVIDER as AiProviderType) ?? 'claude';

    if (providerType !== 'claude') {
      return this.create(providerType);
    }

    const cacheKey = `claude:${task}`;
    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey)!;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

    const model = task === 'suggestion'
      ? (process.env.CLAUDE_SUGGESTION_MODEL ?? 'claude-haiku-4-5-20251001')
      : (process.env.CLAUDE_GENERATION_MODEL ?? 'claude-sonnet-4-6-20250514');
    const provider = new ClaudeProvider(apiKey, model);

    this.providers.set(cacheKey, provider);
    return provider;
  }

  static async getBestAvailable(): Promise<IAiProvider> {
    const priorities: AiProviderType[] = ['claude', 'grok'];

    for (const type of priorities) {
      try {
        const provider = this.create(type);
        const { available } = await provider.checkAvailability();
        if (available) return provider;
      } catch {
        continue;
      }
    }

    throw new Error('No AI provider available');
  }
}
