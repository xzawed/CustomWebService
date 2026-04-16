export interface AiPrompt {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  extendedThinking?: boolean;
}

export interface AiResponse {
  content: string;
  tokensUsed: { input: number; output: number };
  model: string;
  provider: string;
  durationMs: number;
}

/** generateCodeStream의 반환 타입 — AiResponse와 동일한 구조 */
export type AiStreamResult = AiResponse;

export interface IAiProvider {
  readonly name: string;
  readonly model: string;

  generateCode(prompt: AiPrompt): Promise<AiResponse>;
  generateCodeStream(
    prompt: AiPrompt,
    onChunk: (chunk: string, accumulated: string) => void,
  ): Promise<AiStreamResult>;
  checkAvailability(): Promise<{ available: boolean; remainingQuota?: number }>;
}
