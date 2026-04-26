import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runStage1, runStage2Function, runStage3 } from './stageRunner';
import type { IAiProvider } from '@/providers/ai/IAiProvider';
import type { SseWriter } from '@/lib/ai/sseWriter';
import type { ParsedCode } from './stageRunner';

vi.mock('@/lib/ai/codeParser', () => ({
  parseGeneratedCode: vi.fn().mockReturnValue({ html: '<html/>', css: '', js: '' }),
}));

function makeMockProvider() {
  return {
    generateCodeStream: vi.fn().mockResolvedValue({
      content: 'some generated code',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      durationMs: 1000,
      tokensUsed: { input: 100, output: 200 },
    }),
    generateCode: vi.fn(),
    checkAvailability: vi.fn(),
    name: 'mock',
    model: 'mock-model',
  } as unknown as IAiProvider & {
    generateCodeStream: ReturnType<typeof vi.fn>;
    generateCode: ReturnType<typeof vi.fn>;
    checkAvailability: ReturnType<typeof vi.fn>;
  };
}

function makeMockSse(cancelled = false) {
  return {
    send: vi.fn(),
    isCancelled: vi.fn().mockReturnValue(cancelled),
  } as unknown as SseWriter & {
    send: ReturnType<typeof vi.fn>;
    isCancelled: ReturnType<typeof vi.fn>;
  };
}

const mockParsedCode: ParsedCode = { html: '<html/>', css: 'body{}', js: '' };

describe('runStage1()', () => {
  let provider: ReturnType<typeof makeMockProvider>;
  let sse: ReturnType<typeof makeMockSse>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = makeMockProvider();
    sse = makeMockSse();
  });

  it('aiProvider.generateCodeStream을 올바른 프롬프트로 호출한다', async () => {
    await runStage1('sys-prompt', 'user-prompt', provider, sse, false);

    expect(provider.generateCodeStream).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'sys-prompt',
        user: 'user-prompt',
        extendedThinking: false,
      }),
      expect.any(Function)
    );
  });

  it('초기 sse.send progress 이벤트를 발행한다 (step=stage1_generating, progress=5)', async () => {
    await runStage1('sys', 'user', provider, sse, false);

    const progressCalls = (sse.send as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === 'progress'
    );
    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[0][1]).toMatchObject({ step: 'stage1_generating', progress: 5 });
  });

  it('useET=true 시 메시지에 "(심층 분석)"이 포함된다', async () => {
    await runStage1('sys', 'user', provider, sse, true);

    const firstCall = (sse.send as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'progress'
    );
    expect((firstCall![1] as { message: string }).message).toContain('(심층 분석)');
  });

  it('useET=false 시 메시지에 "(심층 분석)"이 포함되지 않는다', async () => {
    await runStage1('sys', 'user', provider, sse, false);

    const firstCall = (sse.send as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'progress'
    );
    expect((firstCall![1] as { message: string }).message).not.toContain('(심층 분석)');
  });

  it('StageResult를 반환한다: parsed, provider, model, durationMs, tokensUsed, userPrompt', async () => {
    const result = await runStage1('sys', 'user-prompt', provider, sse, false);

    expect(result).toMatchObject({
      parsed: { html: '<html/>', css: '', js: '' },
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      durationMs: 1000,
      tokensUsed: { input: 100, output: 200 },
      userPrompt: 'user-prompt',
    });
  });

  it('extendedThinking=true 시 generateCodeStream에 extendedThinking: true가 전달된다', async () => {
    await runStage1('sys', 'user', provider, sse, true);

    expect(provider.generateCodeStream).toHaveBeenCalledWith(
      expect.objectContaining({ extendedThinking: true }),
      expect.any(Function)
    );
  });

  it('sse.isCancelled()=true이면 progress callback에서 sse.send를 추가 호출하지 않는다', async () => {
    const cancelledSse = makeMockSse(true);
    let progressCallback: ((chunk: string, accumulated: string) => void) | null = null;

    provider.generateCodeStream.mockImplementation(
      async (_msgs: unknown, callback: (chunk: string, accumulated: string) => void) => {
        progressCallback = callback;
        // callback은 실행되나 cancelled=true라 sse.send는 호출되지 않아야 함
        callback('chunk', 'accumulated text that is long enough to pass throttle');
        return {
          content: 'code',
          provider: 'anthropic',
          model: 'claude-opus-4-7',
          durationMs: 500,
          tokensUsed: { input: 10, output: 20 },
        };
      }
    );

    await runStage1('sys', 'user', provider, cancelledSse, false);

    // 초기 send 외에 callback으로 인한 추가 send가 없어야 함
    const progressCallsAfterInit = (cancelledSse.send as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === 'progress'
    );
    // isCancelled=true이므로 callback 내부에서 send를 호출하지 않아 초기 1회만 있어야 함
    // (초기 send는 isCancelled 전에 호출됨)
    expect(progressCallback).not.toBeNull();
    // callback 호출로 인한 추가 progress sse.send가 없어야 함
    expect(progressCallsAfterInit.length).toBe(1);
  });
});

describe('runStage2Function()', () => {
  let provider: ReturnType<typeof makeMockProvider>;
  let sse: ReturnType<typeof makeMockSse>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = makeMockProvider();
    sse = makeMockSse();
  });

  it('sse.send가 최소 2번 호출된다 (stage1_complete + stage2_function_generating)', async () => {
    const buildUserPrompt = vi.fn().mockReturnValue('stage2-user-prompt');

    await runStage2Function(
      mockParsedCode,
      'sys-prompt',
      buildUserPrompt,
      [],
      null,
      provider,
      sse
    );

    const steps = (sse.send as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => c[0] === 'progress')
      .map((c: unknown[]) => (c[1] as { step: string }).step);

    expect(steps).toContain('stage1_complete');
    expect(steps).toContain('stage2_function_generating');
  });

  it('StageResult를 반환한다', async () => {
    const buildUserPrompt = vi.fn().mockReturnValue('stage2-user');

    const result = await runStage2Function(
      mockParsedCode,
      'sys',
      buildUserPrompt,
      ['issue1'],
      ['fast-issue'],
      provider,
      sse
    );

    expect(result).toMatchObject({
      parsed: { html: '<html/>', css: '', js: '' },
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      durationMs: 1000,
      tokensUsed: { input: 100, output: 200 },
      userPrompt: 'stage2-user',
    });
  });

  it('buildUserPrompt를 stage1Code, staticQcIssues, fastQcIssues와 함께 호출한다', async () => {
    const buildUserPrompt = vi.fn().mockReturnValue('built-prompt');

    await runStage2Function(
      mockParsedCode,
      'sys',
      buildUserPrompt,
      ['static-issue'],
      ['fast-issue'],
      provider,
      sse
    );

    expect(buildUserPrompt).toHaveBeenCalledWith(mockParsedCode, ['static-issue'], ['fast-issue']);
  });
});

describe('runStage3()', () => {
  let provider: ReturnType<typeof makeMockProvider>;
  let sse: ReturnType<typeof makeMockSse>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = makeMockProvider();
    sse = makeMockSse();
  });

  it('stage2FunctionCompleteAlreadySent=false → stage2_function_complete sse.send를 호출한다', async () => {
    const buildUserPrompt = vi.fn().mockReturnValue('stage3-user');

    await runStage3(mockParsedCode, 'sys', buildUserPrompt, provider, sse, false);

    const steps = (sse.send as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => c[0] === 'progress')
      .map((c: unknown[]) => (c[1] as { step: string }).step);

    expect(steps).toContain('stage2_function_complete');
  });

  it('stage2FunctionCompleteAlreadySent=true → stage2_function_complete를 sse.send하지 않는다', async () => {
    const buildUserPrompt = vi.fn().mockReturnValue('stage3-user');

    await runStage3(mockParsedCode, 'sys', buildUserPrompt, provider, sse, true);

    const steps = (sse.send as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => c[0] === 'progress')
      .map((c: unknown[]) => (c[1] as { step: string }).step);

    expect(steps).not.toContain('stage2_function_complete');
  });

  it('항상 stage3_generating sse.send를 호출한다 (AlreadySent=false)', async () => {
    const buildUserPrompt = vi.fn().mockReturnValue('stage3-user');

    await runStage3(mockParsedCode, 'sys', buildUserPrompt, provider, sse, false);

    const steps = (sse.send as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => c[0] === 'progress')
      .map((c: unknown[]) => (c[1] as { step: string }).step);

    expect(steps).toContain('stage3_generating');
  });

  it('항상 stage3_generating sse.send를 호출한다 (AlreadySent=true)', async () => {
    const buildUserPrompt = vi.fn().mockReturnValue('stage3-user');

    await runStage3(mockParsedCode, 'sys', buildUserPrompt, provider, sse, true);

    const steps = (sse.send as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => c[0] === 'progress')
      .map((c: unknown[]) => (c[1] as { step: string }).step);

    expect(steps).toContain('stage3_generating');
  });

  it('buildUserPrompt를 stage2Code와 함께 호출한다', async () => {
    const buildUserPrompt = vi.fn().mockReturnValue('built-stage3-prompt');

    await runStage3(mockParsedCode, 'sys', buildUserPrompt, provider, sse, false);

    expect(buildUserPrompt).toHaveBeenCalledWith(mockParsedCode);
  });

  it('StageResult를 반환한다', async () => {
    const buildUserPrompt = vi.fn().mockReturnValue('stage3-user-prompt');

    const result = await runStage3(mockParsedCode, 'sys', buildUserPrompt, provider, sse, false);

    expect(result).toMatchObject({
      parsed: { html: '<html/>', css: '', js: '' },
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      durationMs: 1000,
      tokensUsed: { input: 100, output: 200 },
      userPrompt: 'stage3-user-prompt',
    });
  });
});
