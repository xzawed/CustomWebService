import type { IAiProvider } from './IAiProvider';
import { GrokProvider } from './GrokProvider';

export type AiProviderType = 'grok' | 'openai' | 'ollama';

export class AiProviderFactory {
  private static providers = new Map<string, IAiProvider>();

  static create(type?: AiProviderType): IAiProvider {
    const providerType = type ?? (process.env.AI_PROVIDER as AiProviderType) ?? 'grok';

    if (this.providers.has(providerType)) {
      return this.providers.get(providerType)!;
    }

    let provider: IAiProvider;

    switch (providerType) {
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

  static async getBestAvailable(): Promise<IAiProvider> {
    const priorities: AiProviderType[] = ['grok'];

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
