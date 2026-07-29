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
  if (error instanceof Error && error.name === 'AbortError') return false;
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

/** Retry-After 헤더가 있으면 그 값(초→밀리초)을 반환, 없으면 지수 백오프 값 반환 */
function getRetryAfterMs(error: unknown, attempt: number): number {
  if (error !== null && typeof error === 'object' && 'headers' in error) {
    const headers = (error as { headers: unknown }).headers;
    if (headers !== null && typeof headers === 'object' && 'retry-after' in headers) {
      const val = (headers as Record<string, unknown>)['retry-after'];
      const ms = Number(val) * 1000;
      if (!Number.isNaN(ms) && ms > 0) return ms;
    }
  }
  return RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
}

/** 지수 백오프 재시도 래퍼. 재시도 가능한 에러에 대해 최대 MAX_RETRIES 회 재시도. */
async function withRetry<T>(fn: (attempt: number) => Promise<T>, logTag: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = getRetryAfterMs(lastError, attempt);
        logger.warn(`${logTag} retry ${attempt}/${MAX_RETRIES}`, { delay });
        await sleep(delay);
      }
      return await fn(attempt);
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

  constructor(apiKey: string, model = 'claude-sonnet-5') {
    // SDK 타임아웃 — Railway 300s HTTP 컷 전 안전 종료. 운영 중 조정이 필요한 경우
    // ANTHROPIC_TIMEOUT_MS 환경변수로 오버라이드 가능 (기본 270000ms = 270초).
    const timeoutMs = (() => {
      const raw = process.env.ANTHROPIC_TIMEOUT_MS;
      if (!raw) return 270_000;
      const parsed = parseInt(raw, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 270_000;
    })();
    this.client = new Anthropic({ apiKey, timeout: timeoutMs });
    this.model = model;
  }

  async generateCode(prompt: AiPrompt): Promise<AiResponse> {
    const startTime = Date.now();

    return withRetry(async () => {
      const useThinking = prompt.extendedThinking === true;

      const result = await this.client.messages.create({
        model: this.model,
        system: buildSystemParam(prompt.system),
        messages: [{ role: 'user', content: prompt.user }],
        max_tokens: prompt.maxTokens ?? 48000,
        // thinking을 **생략하지 않는다**. Opus 4.8은 생략 = 사고 안 함이었지만
        // Opus 5는 생략 시 adaptive가 기본으로 켜진다(2026-07-29 실측: 생략하면
        // 응답이 [thinking,text], disabled면 [text]). 생략한 채 두면 max_tokens를
        // thinking과 생성물이 나눠 써 코드가 잘리고 비용·지연이 늘어난다.
        //
        // 끌 때 effort를 함께 보내지 않는 것도 의도적이다 — Opus 5는
        // thinking:disabled + effort xhigh/max를 400으로 거부한다(실측). 기본 effort
        // (high)에서만 허용되므로 아예 보내지 않아 조합 자체를 만들지 않는다.
        ...(useThinking
          ? {
              thinking: { type: 'adaptive' as const },
              output_config: { effort: 'high' as const },
            }
          : { thinking: { type: 'disabled' as const } }),
      }, { signal: prompt.abortSignal });

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
    }, 'AI generation');
  }

  async generateCodeStream(
    prompt: AiPrompt,
    onChunk: (chunk: string, accumulated: string) => void,
  ): Promise<AiStreamResult> {
    const startTime = Date.now();

    return withRetry(async () => {
      const useThinking = prompt.extendedThinking === true;

      const stream = this.client.messages.stream({
        model: this.model,
        system: buildSystemParam(prompt.system),
        messages: [{ role: 'user', content: prompt.user }],
        max_tokens: prompt.maxTokens ?? 48000,
        // thinking을 **생략하지 않는다**. Opus 4.8은 생략 = 사고 안 함이었지만
        // Opus 5는 생략 시 adaptive가 기본으로 켜진다(2026-07-29 실측: 생략하면
        // 응답이 [thinking,text], disabled면 [text]). 생략한 채 두면 max_tokens를
        // thinking과 생성물이 나눠 써 코드가 잘리고 비용·지연이 늘어난다.
        //
        // 끌 때 effort를 함께 보내지 않는 것도 의도적이다 — Opus 5는
        // thinking:disabled + effort xhigh/max를 400으로 거부한다(실측). 기본 effort
        // (high)에서만 허용되므로 아예 보내지 않아 조합 자체를 만들지 않는다.
        ...(useThinking
          ? {
              thinking: { type: 'adaptive' as const },
              output_config: { effort: 'high' as const },
            }
          : { thinking: { type: 'disabled' as const } }),
      }, { signal: prompt.abortSignal });

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
    }, 'AI stream');
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
