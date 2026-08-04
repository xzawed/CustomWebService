// scripts/checkAiContract.ts
// Run: pnpm ai:contract-check
//
// Anthropic API 행동 규약 라이브 드리프트 검사.
// 유닛 테스트는 SDK를 모킹하므로 "우리가 X를 보낸다"만 증명한다.
// 이 스크립트는 "서버가 X에 어떻게 응답하는지"를 실측한다.
//
// exit 0 — 모든 규약 유지
// exit 1 — 규약 드리프트 (관측이 기대와 다름)
// exit 2 — API 도달 실패 (키 미설정 / 인증 실패 / 네트워크 / 레이트리밋)
//
// **exit 1과 2를 절대 합치지 말 것.** 일시적 API 장애를 "규약이 바뀌었다"로
// 오인하면 경보 신뢰가 무너진다 — generateCountries.ts의 UpstreamError와 같은 이유다.
import Anthropic from '@anthropic-ai/sdk';
import { describeTaskModels } from '../src/providers/ai/AiProviderFactory';

/**
 * 반드시 다단계 추론을 강제하는 프롬프트.
 * 사소한 프롬프트(예: "ok라고 답해")면 adaptive가 사고하지 않기로 선택해
 * omit / adaptive / disabled 가 전부 [text]만 돌려 프로브가 전부 통과로
 * 조용히 합의한다 — 검사가 무력화된다. 이 상수는 바꾸지 말 것.
 */
const HARD_PROMPT =
  'Three switches outside a windowless room control three bulbs inside. You may flip switches freely but may enter the room only once. Determine which switch controls which bulb, and explain the reasoning precisely.';

const MAX_TOKENS = 3000;

/** 프로브 식별자 — 관측 그라운드 트루스 표와 1:1. */
type ProbeId = 'omit-thinking' | 'adaptive' | 'disabled' | 'disabled-plus-xhigh';

type Expectation =
  | { kind: 'http200'; hasThinking: boolean }
  | { kind: 'http400' };

interface ProbeDef {
  id: ProbeId;
  /** 요청 body에 넣을 추가 필드 (model/messages/max_tokens 제외). */
  extra: Record<string, unknown>;
  expect: Expectation;
  /** 요약 출력용 한 줄 설명. */
  label: string;
}

const PROBES: readonly ProbeDef[] = [
  {
    id: 'omit-thinking',
    extra: {},
    expect: { kind: 'http200', hasThinking: true },
    label: 'thinking 필드 생략 → adaptive 기본 (thinking 블록 있음)',
  },
  {
    id: 'adaptive',
    extra: {
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
    },
    expect: { kind: 'http200', hasThinking: true },
    label: "thinking:{type:'adaptive'}+effort high → thinking 블록 있음",
  },
  {
    id: 'disabled',
    extra: { thinking: { type: 'disabled' } },
    expect: { kind: 'http200', hasThinking: false },
    label: "thinking:{type:'disabled'} → text만 (thinking 없음)",
  },
  {
    id: 'disabled-plus-xhigh',
    extra: {
      thinking: { type: 'disabled' },
      output_config: { effort: 'xhigh' },
    },
    expect: { kind: 'http400' },
    label: "thinking:disabled + effort xhigh → HTTP 400",
  },
];

/** 도달 실패. exit 2 — 드리프트(exit 1)와 구분. */
class ReachabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReachabilityError';
  }
}

interface ProbeObservation {
  id: ProbeId;
  label: string;
  expected: string;
  observed: string;
  ok: boolean;
  outputTokens: number;
}

function contentTypes(content: ReadonlyArray<{ type: string }>): string[] {
  return content.map((b) => b.type);
}

function hasThinkingBlock(content: ReadonlyArray<{ type: string }>): boolean {
  return content.some((b) => b.type === 'thinking' || b.type === 'redacted_thinking');
}

function formatExpectation(expect: Expectation): string {
  if (expect.kind === 'http400') return 'HTTP 400';
  return expect.hasThinking ? 'HTTP 200 + thinking 블록' : 'HTTP 200 + text만(thinking 없음)';
}

/**
 * 단일 프로브 실행. 도달 실패면 ReachabilityError, 규약 불일치는 ok:false 결과로 반환.
 */
async function runProbe(
  client: Anthropic,
  model: string,
  probe: ProbeDef,
): Promise<ProbeObservation> {
  const base = {
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user' as const, content: HARD_PROMPT }],
  };

  try {
    // extra를 그대로 펼친다 — omit-thinking은 extra={}라 thinking이 빠진다.
    // NonStreaming으로 고정 — MessageCreateParams 유니온이면 Stream|Message 가 되어 content 접근이 깨진다.
    const result = await client.messages.create({
      ...base,
      ...probe.extra,
    } as Anthropic.MessageCreateParamsNonStreaming);

    const types = contentTypes(result.content);
    const thinking = hasThinkingBlock(result.content);
    const outputTokens = result.usage.output_tokens;
    const observed = `HTTP 200 · content=[${types.join(', ')}] · thinking=${thinking ? '있음' : '없음'}`;

    if (probe.expect.kind === 'http400') {
      // 400을 기대했는데 200이면 규약 드리프트
      return {
        id: probe.id,
        label: probe.label,
        expected: formatExpectation(probe.expect),
        observed,
        ok: false,
        outputTokens,
      };
    }

    const ok = thinking === probe.expect.hasThinking;
    return {
      id: probe.id,
      label: probe.label,
      expected: formatExpectation(probe.expect),
      observed,
      ok,
      outputTokens,
    };
  } catch (e: unknown) {
    // Anthropic SDK: APIError에 status가 있다
    const status = extractHttpStatus(e);
    const message = e instanceof Error ? e.message : String(e);

    if (status === 400) {
      const observed = `HTTP 400 · ${shortError(message)}`;
      if (probe.expect.kind === 'http400') {
        return {
          id: probe.id,
          label: probe.label,
          expected: formatExpectation(probe.expect),
          observed,
          ok: true,
          outputTokens: 0,
        };
      }
      // 200을 기대했는데 400이면 규약 드리프트 (도달은 됨)
      return {
        id: probe.id,
        label: probe.label,
        expected: formatExpectation(probe.expect),
        observed,
        ok: false,
        outputTokens: 0,
      };
    }

    // 401/403/429/5xx/네트워크 등 — 도달 실패. 드리프트가 아니다.
    if (status === null) {
      throw new ReachabilityError(`네트워크/알 수 없는 오류 (${probe.id}): ${message}`);
    }
    throw new ReachabilityError(
      `API 도달 실패 HTTP ${status} (${probe.id}): ${shortError(message)}`,
    );
  }
}

function extractHttpStatus(e: unknown): number | null {
  if (e !== null && typeof e === 'object' && 'status' in e) {
    const s = (e as { status: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return null;
}

function shortError(message: string): string {
  // 한 줄 요약 — 전체 스택/JSON을 덤프하지 않는다
  const first = message.split('\n')[0] ?? message;
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}

/**
 * 출시 모델 해석. describeTaskModels().generation.resolved 를 우선 사용한다.
 * (tsx가 팩토리의 `@/` 별칭을 해석 못하면 AI_MODEL_GENERATION 폴백 — 허용목록
 * 검증은 빠지므로 중복이지만 스크립트 단독 실행 가능성을 남긴다.)
 */
function resolveGenerationModel(): string {
  try {
    return describeTaskModels().generation.resolved;
  } catch {
    // 경로 별칭 해석 실패 시 폴백. AiProviderFactory 허용목록과 중복되지만
    // 이 스크립트만 돌릴 때 import 체인 실패를 막기 위함이다.
    return process.env.AI_MODEL_GENERATION?.trim() || 'claude-opus-5';
  }
}

/** 반환값이 프로세스 종료 코드다. 0 유지 · 1 드리프트 · 2 도달 실패. */
async function main(): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      'ANTHROPIC_API_KEY가 비어 있거나 설정되지 않았습니다. 라이브 규약 검사를 건너뜁니다 (exit 2 — 도달 실패, 드리프트 아님).',
    );
    return 2;
  }

  const model = resolveGenerationModel();
  console.error(`모델: ${model}`);
  console.error(`프롬프트: 다단계 추론 강제 (HARD_PROMPT)`);
  console.error('');

  const client = new Anthropic({ apiKey });
  const results: ProbeObservation[] = [];
  let totalOutputTokens = 0;

  for (const probe of PROBES) {
    console.error(`→ 프로브 ${probe.id} …`);
    const obs = await runProbe(client, model, probe);
    results.push(obs);
    totalOutputTokens += obs.outputTokens;
    const mark = obs.ok ? '✓' : '✗';
    console.error(
      `  ${mark} ${probe.id}  기대=${obs.expected}  관측=${obs.observed}`,
    );
  }

  console.error('');
  console.error('── 요약 ──');
  for (const r of results) {
    const mark = r.ok ? '✓' : '✗';
    console.error(`${mark}  ${r.id.padEnd(22)}  ${r.label}`);
  }
  console.error('');
  console.error(`모델: ${model}`);
  console.error(`총 출력 토큰: ${totalOutputTokens}`);

  const allOk = results.every((r) => r.ok);
  if (allOk) {
    console.error('');
    console.error('결과: 모든 규약 유지 (exit 0)');
    console.error(
      '참고: 이 검사는 실제 토큰 비용이 든다. SDK·모델 상향 직후 수동 실행용이며 스케줄 실행 대상이 아니다.',
    );
    return 0;
  }

  const failed = results.filter((r) => !r.ok).map((r) => r.id);
  console.error('');
  console.error(`결과: 규약 드리프트 (exit 1) — 실패: ${failed.join(', ')}`);
  return 1;
}

// `process.exit()`를 쓰지 않는다. fetch(undici)/SDK 핸들이 살아 있는 동안 강제 종료하면
// Windows에서 libuv 어서션(`UV_HANDLE_CLOSING`)으로 죽고 **종료 코드가 뭉개진다**
// (실측: exit 1이 127로 보고됨). 호출자가 코드로 분기하므로 치명적이다.
// exitCode만 세팅하고 이벤트 루프가 비면 자연 종료시킨다.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: unknown) => {
    if (e instanceof ReachabilityError) {
      console.error(e.message);
      console.error('결과: API 도달 실패 (exit 2) — 드리프트가 아니다');
      process.exitCode = 2;
      return;
    }
    console.error(e);
    // 예상 밖 예외 — 도달 실패로 취급 (드리프트 단정 금지)
    process.exitCode = 2;
  });
