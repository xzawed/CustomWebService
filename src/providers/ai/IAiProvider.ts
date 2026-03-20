export interface AiPrompt {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiResponse {
  content: string;
  tokensUsed: { input: number; output: number };
  model: string;
  provider: string;
  durationMs: number;
}

export interface IAiProvider {
  readonly name: string;
  readonly model: string;

  generateCode(prompt: AiPrompt): Promise<AiResponse>;
  generateCodeStream(prompt: AiPrompt): AsyncGenerator<string>;
  checkAvailability(): Promise<{ available: boolean; remainingQuota?: number }>;
}
