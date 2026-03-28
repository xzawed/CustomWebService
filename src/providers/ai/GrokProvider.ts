import OpenAI from 'openai';
import type { IAiProvider, AiPrompt, AiResponse } from './IAiProvider';

export class GrokProvider implements IAiProvider {
  readonly name = 'grok';
  readonly model: string;
  private client: OpenAI;

  constructor(apiKey: string, model = 'grok-3-mini') {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1',
    });
    this.model = model;
  }

  async generateCode(prompt: AiPrompt): Promise<AiResponse> {
    const startTime = Date.now();

    const result = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: prompt.temperature ?? 0.7,
      max_tokens: prompt.maxTokens ?? 8192,
    });

    const text = result.choices[0]?.message?.content ?? '';
    const usage = result.usage;

    return {
      content: text,
      tokensUsed: {
        input: usage?.prompt_tokens ?? 0,
        output: usage?.completion_tokens ?? 0,
      },
      model: this.model,
      provider: this.name,
      durationMs: Date.now() - startTime,
    };
  }

  async *generateCodeStream(prompt: AiPrompt): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: prompt.temperature ?? 0.7,
      max_tokens: prompt.maxTokens ?? 8192,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  }

  async checkAvailability(): Promise<{ available: boolean; remainingQuota?: number }> {
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5,
      });
      return { available: true };
    } catch (error: unknown) {
      const status =
        error !== null &&
        typeof error === 'object' &&
        'status' in error &&
        typeof (error as { status: unknown }).status === 'number'
          ? (error as { status: number }).status
          : undefined;
      if (status === 429) {
        return { available: false, remainingQuota: 0 };
      }
      return { available: false };
    }
  }
}
