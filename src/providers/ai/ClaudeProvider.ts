import Anthropic from '@anthropic-ai/sdk';
import type { IAiProvider, AiPrompt, AiResponse, AiStreamResult } from './IAiProvider';
import { logger } from '@/lib/utils/logger';

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function getErrorStatus(error: unknown): number | undefined {
  if (error !== null && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

function isRetryableError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status !== undefined && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
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

/** Prompt caching: 시스템 프롬프트를 ephemeral 캐시 블록으로 래핑 */
function buildSystemParam(
  text: string,
): Anthropic.TextBlockParam[] {
  return [
    {
      type: 'text' as const,
      text,
      cache_control: { type: 'ephemeral' as const },
    },
  ];
}

export class ClaudeProvider implements IAiProvider {
  readonly name = 'claude';
  readonly model: string;
  private client: Anthropic;

  constructor(apiKey: string, model = 'claude-sonnet-4-6') {
    this.client = new Anthropic({ apiKey });
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

        const useThinking = prompt.extendedThinking === true;

        const result = await this.client.messages.create({
          model: this.model,
          system: buildSystemParam(prompt.system),
          messages: [{ role: 'user', content: prompt.user }],
          // Extended thinking 활성화 시 temperature 1 필수 (API 요구사항)
          temperature: useThinking ? 1 : (prompt.temperature ?? 0.7),
          max_tokens: prompt.maxTokens ?? 32000,
          ...(useThinking && {
            thinking: { type: 'enabled' as const, budget_tokens: 10000 },
          }),
        });

        const textBlock = result.content.find(
          (b): b is Anthropic.TextBlock => b.type === 'text',
        );
        const text = textBlock?.text ?? '';

        return {
          content: text,
          tokensUsed: {
            input: result.usage.input_tokens,
            output: result.usage.output_tokens,
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

        const useThinking = prompt.extendedThinking === true;

        const stream = this.client.messages.stream({
          model: this.model,
          system: buildSystemParam(prompt.system),
          messages: [{ role: 'user', content: prompt.user }],
          temperature: useThinking ? 1 : (prompt.temperature ?? 0.7),
          max_tokens: prompt.maxTokens ?? 32000,
          ...(useThinking && {
            thinking: { type: 'enabled' as const, budget_tokens: 10000 },
          }),
        });

        let accumulated = '';

        stream.on('text', (text) => {
          accumulated += text;
          onChunk(text, accumulated);
        });

        const finalMessage = await stream.finalMessage();

        return {
          content: accumulated,
          tokensUsed: {
            input: finalMessage.usage.input_tokens,
            output: finalMessage.usage.output_tokens,
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

  async checkAvailability(): Promise<{ available: boolean; remainingQuota?: number }> {
    try {
      await this.client.messages.create({
        model: this.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return { available: true };
    } catch (error: unknown) {
      if (getErrorStatus(error) === 429) {
        return { available: false, remainingQuota: 0 };
      }
      return { available: false };
    }
  }
}
