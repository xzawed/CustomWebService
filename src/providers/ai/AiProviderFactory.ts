import { logger } from '@/lib/utils/logger';
import type { IAiProvider } from './IAiProvider';
import { ClaudeProvider } from './ClaudeProvider';

export type AiProviderType = 'claude';
export type AiTaskType = 'generation' | 'suggestion';

// 구세대 ID를 지우지 않는다 — 신모델에 문제가 생겼을 때 Railway env만 되돌려
// 즉시 복구할 수 있어야 한다. 목록에 없는 값은 조용히 기본값으로 폴백하므로,
// 여기서 지우면 롤백 시도가 경고 한 줄만 남기고 무시된다.
const ALLOWED_CLAUDE_MODELS = [
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-sonnet-5',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5',
] as const;
type AllowedClaudeModel = (typeof ALLOWED_CLAUDE_MODELS)[number];

// suggestion은 Haiku 4.5 유지 — 4.5가 여전히 최신 Haiku다(Haiku 5는 없다).
const TASK_DEFAULTS: Record<AiTaskType, AllowedClaudeModel> = {
  suggestion: 'claude-haiku-4-5',
  generation: 'claude-opus-5',
};

const TASK_ENV_VARS: Record<AiTaskType, string> = {
  suggestion: 'AI_MODEL_SUGGESTION',
  generation: 'AI_MODEL_GENERATION',
};

function resolveTaskModel(task: AiTaskType): AllowedClaudeModel {
  const envVar = TASK_ENV_VARS[task];
  const fallback = TASK_DEFAULTS[task];
  const raw = process.env[envVar]?.trim();

  if (!raw) return fallback;

  if (!(ALLOWED_CLAUDE_MODELS as readonly string[]).includes(raw)) {
    logger.warn(`${envVar}에 허용되지 않은 모델 ID: "${raw}". 기본값(${fallback}) 사용`, {
      envVar,
      raw,
      allowed: ALLOWED_CLAUDE_MODELS,
    });
    return fallback;
  }

  return raw as AllowedClaudeModel;
}

export class AiProviderFactory {
  private static providers = new Map<string, IAiProvider>();

  static create(type?: AiProviderType): IAiProvider {
    const providerType = type ?? (process.env.AI_PROVIDER as AiProviderType) ?? 'claude';

    if (this.providers.has(providerType)) {
      return this.providers.get(providerType)!;
    }

    if (providerType !== 'claude') {
      throw new Error(`Unknown AI provider: ${providerType}`);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

    const provider = new ClaudeProvider(apiKey);
    this.providers.set(providerType, provider);
    return provider;
  }

  /** 테스트에서 캐시된 인스턴스를 초기화할 때 사용 */
  static clearCache(): void {
    this.providers.clear();
  }

  static createForTask(task: AiTaskType): IAiProvider {
    const model = resolveTaskModel(task);
    const cacheKey = `claude:${task}:${model}`;

    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey)!;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

    const provider = new ClaudeProvider(apiKey, model);
    this.providers.set(cacheKey, provider);
    return provider;
  }
}
