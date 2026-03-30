import OpenAI from 'openai';
import type { IAiProvider, AiPrompt, AiResponse, AiStreamResult } from './IAiProvider';
import { logger } from '@/lib/utils/logger';

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function isRetryableError(error: unknown): boolean {
  if (error !== null && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return RETRYABLE_STATUS_CODES.has(status);
  }
  // Network errors (ECONNRESET, ETIMEDOUT, etc.)
  if (error instanceof Error && ('code' in error || error.message.includes('fetch'))) {
    return true;
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GrokProvider implements IAiProvider {
  readonly name = 'grok';
  readonly model: string;
  private client: OpenAI;

  constructor(apiKey: string, model = 'grok-4') {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1',
    });
    this.model = model;
  }

  async generateCode(prompt: AiPrompt): Promise<AiResponse> {
    const startTime = Date.now();
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.warn(`AI generation retry ${attempt}/${MAX_RETRIES}`, {
            delay,
            provider: this.name,
          });
          await sleep(delay);
        }

        const result = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature: prompt.temperature ?? 0.7,
          max_tokens: prompt.maxTokens ?? 32000,
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
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES && isRetryableError(error)) {
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  async generateCodeStream(
    prompt: AiPrompt,
    onChunk: (chunk: string, accumulated: string) => void,
  ): Promise<AiStreamResult> {
    const startTime = Date.now();
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.warn(`AI stream retry ${attempt}/${MAX_RETRIES}`, {
            delay,
            provider: this.name,
          });
          await sleep(delay);
        }

        const stream = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature: prompt.temperature ?? 0.7,
          max_tokens: prompt.maxTokens ?? 32000,
          stream: true,
          stream_options: { include_usage: true },
        });

        let accumulated = '';
        let inputTokens = 0;
        let outputTokens = 0;

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) {
            accumulated += text;
            onChunk(text, accumulated);
          }
          // Capture usage from the final chunk
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? 0;
            outputTokens = chunk.usage.completion_tokens ?? 0;
          }
        }

        return {
          content: accumulated,
          tokensUsed: { input: inputTokens, output: outputTokens },
          model: this.model,
          provider: this.name,
          durationMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES && isRetryableError(error)) {
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  async checkAvailability(): Promise<{ available: boolean; remainingQuota?: number }> {
    try {
      // 토큰 낭비 방지: 최소한의 요청으로 가용성 확인
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
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
