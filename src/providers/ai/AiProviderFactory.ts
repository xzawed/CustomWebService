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

/**
 * task 별 실효 모델 ID. **`IAiProvider` 를 쓰지 않고 Anthropic SDK 를 직접 호출하는 곳도
 * 반드시 이걸 통해야 한다** — 안 그러면 `AI_MODEL_*` env 가 그 경로에만 닿지 않고,
 * 허용목록 검증·경고도 건너뛴다.
 *
 * 실제로 그런 우회가 2곳 있었다(2026-08-07 발견): `preferencesRecommender` ·
 * `featureExtractor` 가 `model: 'claude-haiku-4-5'` 를 하드코딩하고 있었다.
 * 값이 기본값과 우연히 같아 비용 사고는 없었지만, env 로 모델을 바꿔도 그 둘만 안 바뀌었다.
 * tool use(`tools`/`tool_choice`)가 필요해 `IAiProvider` 를 못 쓰는 경우가 그 이유이므로,
 * **모델 해석만 공유**하는 것이 올바른 접합점이다.
 */
export function resolveTaskModel(task: AiTaskType): AllowedClaudeModel {
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

export interface TaskModelDiagnostic {
  /** `AI_MODEL_*` env 원본 값. 미설정이면 null. */
  env: string | null;
  /** 실제로 적용되는 모델. */
  resolved: AllowedClaudeModel;
  /** env를 지정했는데 허용목록에 없어 기본값으로 밀렸는지. */
  fellBack: boolean;
}

/**
 * 태스크별 모델 해석 결과. 진단 엔드포인트에서 소비한다.
 *
 * env 값만 보면 실제 적용 모델을 알 수 없다 — 허용목록에 없는 값은 경고 로그 한 줄만 남기고
 * 조용히 기본값으로 폴백하기 때문이다. 2026-07-10에 `AI_MODEL_GENERATION`이 그렇게 밀려
 * 구모델로 돌고 있던 것을 뒤늦게 발견한 적이 있어, `fellBack`으로 드러나게 한다.
 */
export function describeTaskModels(): Record<AiTaskType, TaskModelDiagnostic> {
  const describe = (task: AiTaskType): TaskModelDiagnostic => {
    const env = process.env[TASK_ENV_VARS[task]]?.trim() || null;
    const resolved = resolveTaskModel(task);
    return { env, resolved, fellBack: env !== null && env !== resolved };
  };
  return { generation: describe('generation'), suggestion: describe('suggestion') };
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
