import type { IAiProvider } from './IAiProvider';
import { GeminiProvider } from './GeminiProvider';

export type AiProviderType = 'gemini' | 'openai' | 'ollama';

export class AiProviderFactory {
  private static providers = new Map<string, IAiProvider>();

  static create(type?: AiProviderType): IAiProvider {
    const providerType = type ?? (process.env.AI_PROVIDER as AiProviderType) ?? 'gemini';

    if (this.providers.has(providerType)) {
      return this.providers.get(providerType)!;
    }

    let provider: IAiProvider;

    switch (providerType) {
      case 'gemini': {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
        provider = new GeminiProvider(apiKey);
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
    const priorities: AiProviderType[] = ['gemini'];

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
