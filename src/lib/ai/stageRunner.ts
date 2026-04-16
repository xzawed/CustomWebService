import type { IAiProvider } from '@/providers/ai/IAiProvider';
import { parseGeneratedCode } from '@/lib/ai/codeParser';
import type { SseWriter } from '@/lib/ai/sseWriter';

export type ParsedCode = { html: string; css: string; js: string };

export interface StageResult {
  parsed: ParsedCode;
  provider: string;
  model: string;
  durationMs: number;
  tokensUsed: { input: number; output: number };
  userPrompt: string;
}

/** Stage 1: 구조·기능 생성 (progress 5→28%) */
export async function runStage1(
  systemPrompt: string,
  userPrompt: string,
  aiProvider: IAiProvider,
  sse: SseWriter,
  useET: boolean,
): Promise<StageResult> {
  let lastProgressUpdate = Date.now();
  const streamStartTime = Date.now();

  sse.send('progress', { step: 'stage1_generating', progress: 5, message: `1단계: 구조 및 기능 생성 중...${useET ? ' (심층 분석)' : ''}` });

  const response = await aiProvider.generateCodeStream(
    { system: systemPrompt, user: userPrompt, extendedThinking: useET },
    (_chunk: string, accumulated: string) => {
      if (sse.isCancelled()) return;
      const now = Date.now();
      if (now - lastProgressUpdate < 500) return;
      lastProgressUpdate = now;
      const estimatedProgress = Math.min(28, 5 + Math.floor((accumulated.length / 15000) * 23));
      const elapsed = Math.floor((now - streamStartTime) / 1000);
      sse.send('progress', {
        step: 'stage1_generating',
        progress: estimatedProgress,
        message: `1단계: 구조 및 기능 생성 중... (${elapsed}초 경과, ${(accumulated.length / 1024).toFixed(1)}KB)`,
      });
    },
  );

  return {
    parsed: parseGeneratedCode(response.content),
    provider: response.provider,
    model: response.model,
    durationMs: response.durationMs,
    tokensUsed: response.tokensUsed,
    userPrompt,
  };
}

/** Stage 2: 기능 버그 수정 (progress 35→62%) */
export async function runStage2Function(
  stage1Code: ParsedCode,
  systemPrompt: string,
  buildUserPrompt: (
    code: ParsedCode,
    staticIssues: string[],
    qcIssues: string[] | null,
  ) => string,
  staticQcIssues: string[],
  fastQcIssues: string[] | null,
  aiProvider: IAiProvider,
  sse: SseWriter,
): Promise<StageResult> {
  sse.send('progress', { step: 'stage1_complete', progress: 30, message: '구조 완성. 기능 검증 중...' });
  sse.send('progress', { step: 'stage2_function_generating', progress: 35, message: '2단계: 기능 버그 수정 중...' });

  const userPrompt = buildUserPrompt(stage1Code, staticQcIssues, fastQcIssues);
  let lastProgressUpdate = Date.now();
  const streamStartTime = Date.now();

  const response = await aiProvider.generateCodeStream(
    { system: systemPrompt, user: userPrompt },
    (_chunk: string, accumulated: string) => {
      if (sse.isCancelled()) return;
      const now = Date.now();
      if (now - lastProgressUpdate < 500) return;
      lastProgressUpdate = now;
      const estimatedProgress = Math.min(62, 35 + Math.floor((accumulated.length / 10000) * 27));
      const elapsed = Math.floor((now - streamStartTime) / 1000);
      sse.send('progress', {
        step: 'stage2_function_generating',
        progress: estimatedProgress,
        message: `2단계: 기능 버그 수정 중... (${elapsed}초 경과)`,
      });
    },
  );

  return {
    parsed: parseGeneratedCode(response.content),
    provider: response.provider,
    model: response.model,
    durationMs: response.durationMs,
    tokensUsed: response.tokensUsed,
    userPrompt,
  };
}

/** Stage 3: 디자인·폴리시 (progress 68→82%) */
export async function runStage3(
  stage2Code: ParsedCode,
  systemPrompt: string,
  buildUserPrompt: (code: ParsedCode) => string,
  aiProvider: IAiProvider,
  sse: SseWriter,
  /** Stage 2가 스킵되어 stage2_function_complete 이벤트가 이미 발행된 경우 true */
  stage2FunctionCompleteAlreadySent = false,
): Promise<StageResult> {
  if (!stage2FunctionCompleteAlreadySent) {
    sse.send('progress', { step: 'stage2_function_complete', progress: 65, message: '기능 검증 완성. 디자인 적용 중...' });
  }
  sse.send('progress', { step: 'stage3_generating', progress: 68, message: '3단계: 디자인 및 인터랙션 적용 중...' });

  const userPrompt = buildUserPrompt(stage2Code);

  let lastProgressUpdate = Date.now();
  const streamStartTime = Date.now();

  const response = await aiProvider.generateCodeStream(
    { system: systemPrompt, user: userPrompt },
    (_chunk: string, accumulated: string) => {
      if (sse.isCancelled()) return;
      const now = Date.now();
      if (now - lastProgressUpdate < 500) return;
      lastProgressUpdate = now;
      const estimatedProgress = Math.min(82, 68 + Math.floor((accumulated.length / 15000) * 14));
      const elapsed = Math.floor((now - streamStartTime) / 1000);
      sse.send('progress', {
        step: 'stage3_generating',
        progress: estimatedProgress,
        message: `3단계: 디자인 및 인터랙션 적용 중... (${elapsed}초 경과, ${(accumulated.length / 1024).toFixed(1)}KB)`,
      });
    },
  );

  return {
    parsed: parseGeneratedCode(response.content),
    provider: response.provider,
    model: response.model,
    durationMs: response.durationMs,
    tokensUsed: response.tokensUsed,
    userPrompt,
  };
}
