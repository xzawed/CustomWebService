import { GoogleGenerativeAI } from '@google/generative-ai';
import type { IAiProvider, AiPrompt, AiResponse } from './IAiProvider';

export class GeminiProvider implements IAiProvider {
  readonly name = 'gemini';
  readonly model: string;
  private client: GoogleGenerativeAI;

  constructor(apiKey: string, model = 'gemini-1.5-flash') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async generateCode(prompt: AiPrompt): Promise<AiResponse> {
    const startTime = Date.now();
    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: prompt.system,
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
      generationConfig: {
        temperature: prompt.temperature ?? 0.7,
        maxOutputTokens: prompt.maxTokens ?? 8192,
      },
    });

    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata;

    return {
      content: text,
      tokensUsed: {
        input: usage?.promptTokenCount ?? 0,
        output: usage?.candidatesTokenCount ?? 0,
      },
      model: this.model,
      provider: this.name,
      durationMs: Date.now() - startTime,
    };
  }

  async *generateCodeStream(prompt: AiPrompt): AsyncGenerator<string> {
    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: prompt.system,
    });

    const result = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
      generationConfig: {
        temperature: prompt.temperature ?? 0.7,
        maxOutputTokens: prompt.maxTokens ?? 8192,
      },
    });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }

  async checkAvailability(): Promise<{ available: boolean; remainingQuota?: number }> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      await model.generateContent('test');
      return { available: true };
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      if (status === 429) {
        return { available: false, remainingQuota: 0 };
      }
      return { available: false };
    }
  }
}
