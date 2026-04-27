import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QcReport } from '@/types/qc';
import type { ICodeRepository } from '@/repositories/interfaces';
import type { GeneratedCode } from '@/types/project';

vi.mock('@/lib/qc', () => ({
  runDeepQc: vi.fn(),
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/ai/codeParser', () => ({
  assembleHtml: vi.fn(),
}));

import { runDeepQcAndUpdate } from './deepQcRunner';
import { runDeepQc } from '@/lib/qc';
import { eventBus } from '@/lib/events/eventBus';
import { logger } from '@/lib/utils/logger';
import { assembleHtml } from '@/lib/ai/codeParser';

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

const VALID_PARSED = { html: '<div>Hello</div>', css: 'body {}', js: '' };

function makeQcReport(overrides: Partial<QcReport> = {}): QcReport {
  return {
    overallScore: 85,
    passed: true,
    checks: [{ name: 'consoleErrors', passed: true, score: 100, details: [], durationMs: 5 }],
    viewportsTested: [375],
    durationMs: 100,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeCode(overrides: Partial<GeneratedCode> = {}): GeneratedCode {
  return {
    id: 'code-1',
    projectId: 'proj-1',
    version: 1,
    html: '',
    css: '',
    js: '',
    metadata: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  } as unknown as GeneratedCode;
}

function createMockCodeRepo() {
  return {
    findById: vi.fn(),
    update: vi.fn(),
  } as unknown as ICodeRepository;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assembleHtml).mockReturnValue('<html><body>test</body></html>');
});

describe('safeAssembleHtml — assembleHtml 오류', () => {
  it('assembleHtml throws → 경고 로그 후 조기 반환, runDeepQc 미호출', () => {
    vi.mocked(assembleHtml).mockImplementation(() => {
      throw new Error('parse error');
    });
    const codeRepo = createMockCodeRepo();

    runDeepQcAndUpdate('proj-1', 'code-1', VALID_PARSED, codeRepo);

    expect(vi.mocked(runDeepQc)).not.toHaveBeenCalled();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      'safeAssembleHtml returned null for Deep QC, skipping',
      expect.objectContaining({ projectId: 'proj-1' }),
    );
  });
});

describe('runDeepQcAndUpdate — 성공 경로', () => {
  it('QC 통과 → QC_REPORT_COMPLETED 이벤트 발행 + 메타데이터 업데이트', async () => {
    const report = makeQcReport();
    vi.mocked(runDeepQc).mockResolvedValue(report);
    const codeRepo = createMockCodeRepo();
    const existing = makeCode({ metadata: { qualityScore: 99 } });
    vi.mocked(codeRepo.findById).mockResolvedValue(existing);
    vi.mocked(codeRepo.update).mockResolvedValue(existing);

    runDeepQcAndUpdate('proj-1', 'code-1', VALID_PARSED, codeRepo);
    await flushPromises();

    expect(vi.mocked(eventBus.emit)).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'QC_REPORT_COMPLETED',
        payload: expect.objectContaining({
          projectId: 'proj-1',
          overallScore: 85,
          passed: true,
          isDeep: true,
        }),
      }),
    );
    expect(vi.mocked(codeRepo.update)).toHaveBeenCalledWith(
      'code-1',
      expect.objectContaining({
        metadata: expect.objectContaining({
          qualityScore: 99,
          renderingQcScore: 85,
          renderingQcPassed: true,
          renderingQcChecks: expect.any(Array),
        }),
      }),
    );
  });

  it('runDeepQc null 반환 → 이벤트 미발행, DB 미업데이트', async () => {
    vi.mocked(runDeepQc).mockResolvedValue(null);
    const codeRepo = createMockCodeRepo();

    runDeepQcAndUpdate('proj-1', 'code-1', VALID_PARSED, codeRepo);
    await flushPromises();

    expect(vi.mocked(eventBus.emit)).not.toHaveBeenCalled();
    expect(vi.mocked(codeRepo.findById)).not.toHaveBeenCalled();
  });

  it('findById null 반환 → update 미호출, 이벤트는 발행됨', async () => {
    vi.mocked(runDeepQc).mockResolvedValue(makeQcReport());
    const codeRepo = createMockCodeRepo();
    vi.mocked(codeRepo.findById).mockResolvedValue(null);

    runDeepQcAndUpdate('proj-1', 'code-1', VALID_PARSED, codeRepo);
    await flushPromises();

    expect(vi.mocked(eventBus.emit)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'QC_REPORT_COMPLETED' }),
    );
    expect(vi.mocked(codeRepo.update)).not.toHaveBeenCalled();
  });

  it('update 오류 → 경고 로그, 이벤트는 이미 발행됨', async () => {
    vi.mocked(runDeepQc).mockResolvedValue(makeQcReport());
    const codeRepo = createMockCodeRepo();
    vi.mocked(codeRepo.findById).mockResolvedValue(makeCode());
    vi.mocked(codeRepo.update).mockRejectedValue(new Error('DB write error'));

    runDeepQcAndUpdate('proj-1', 'code-1', VALID_PARSED, codeRepo);
    await flushPromises();

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      'Deep QC metadata update failed',
      expect.objectContaining({ projectId: 'proj-1', codeId: 'code-1' }),
    );
    expect(vi.mocked(eventBus.emit)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'QC_REPORT_COMPLETED' }),
    );
  });
});

describe('runDeepQcAndUpdate — 실패 경로', () => {
  it('runDeepQc 오류 → QC_REPORT_FAILED 이벤트 발행 + deepQcFailed 메타데이터', async () => {
    vi.mocked(runDeepQc).mockRejectedValue(new Error('browser crash'));
    const codeRepo = createMockCodeRepo();
    const existing = makeCode();
    vi.mocked(codeRepo.findById).mockResolvedValue(existing);
    vi.mocked(codeRepo.update).mockResolvedValue(existing);

    runDeepQcAndUpdate('proj-1', 'code-1', VALID_PARSED, codeRepo);
    await flushPromises();

    expect(vi.mocked(eventBus.emit)).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'QC_REPORT_FAILED',
        payload: expect.objectContaining({
          projectId: 'proj-1',
          stage: 'deep',
          error: 'browser crash',
        }),
      }),
    );
    expect(vi.mocked(codeRepo.update)).toHaveBeenCalledWith(
      'code-1',
      expect.objectContaining({
        metadata: expect.objectContaining({ deepQcFailed: true }),
      }),
    );
  });

  it('runDeepQc 오류 + findById null → update 미호출', async () => {
    vi.mocked(runDeepQc).mockRejectedValue(new Error('QC timeout'));
    const codeRepo = createMockCodeRepo();
    vi.mocked(codeRepo.findById).mockResolvedValue(null);

    runDeepQcAndUpdate('proj-1', 'code-1', VALID_PARSED, codeRepo);
    await flushPromises();

    expect(vi.mocked(eventBus.emit)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'QC_REPORT_FAILED' }),
    );
    expect(vi.mocked(codeRepo.update)).not.toHaveBeenCalled();
  });

  it('runDeepQc 오류 + findById throw → 경고 로그', async () => {
    vi.mocked(runDeepQc).mockRejectedValue(new Error('QC error'));
    const codeRepo = createMockCodeRepo();
    vi.mocked(codeRepo.findById).mockRejectedValue(new Error('DB read error'));

    runDeepQcAndUpdate('proj-1', 'code-1', VALID_PARSED, codeRepo);
    await flushPromises();

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      'Deep QC failure metadata update failed',
      expect.objectContaining({ codeId: 'code-1' }),
    );
  });
});
