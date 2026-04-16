import { runDeepQc } from '@/lib/qc';
import { eventBus } from '@/lib/events/eventBus';
import { logger } from '@/lib/utils/logger';
import { assembleHtml } from '@/lib/ai/codeParser';
import type { ICodeRepository } from '@/repositories/interfaces';

function safeAssembleHtml(code: { html: string; css: string; js: string }): string | null {
  try {
    return assembleHtml(code);
  } catch {
    return null;
  }
}

/**
 * Deep QC를 fire-and-forget으로 실행하고, 결과를 ICodeRepository를 통해 메타데이터로 저장.
 * 아키텍처: Supabase 직접 호출 대신 Repository 패턴 사용.
 */
export function runDeepQcAndUpdate(
  projectId: string,
  codeId: string,
  parsed: { html: string; css: string; js: string },
  codeRepo: ICodeRepository,
): void {
  const assembledForDeepQc = safeAssembleHtml(parsed);
  if (!assembledForDeepQc) {
    logger.warn('safeAssembleHtml returned null for Deep QC, skipping', { projectId });
    return;
  }

  runDeepQc(assembledForDeepQc)
    .then(async (deepReport) => {
      if (!deepReport) return;

      logger.info('Deep QC completed', {
        projectId,
        qcScore: deepReport.overallScore,
        qcPassed: deepReport.passed,
        checks: deepReport.checks.map((c) => ({ name: c.name, passed: c.passed, score: c.score })),
      });

      eventBus.emit({
        type: 'QC_REPORT_COMPLETED',
        payload: {
          projectId,
          overallScore: deepReport.overallScore,
          passed: deepReport.passed,
          checks: deepReport.checks.map((c) => ({ name: c.name, passed: c.passed, score: c.score })),
          isDeep: true,
        },
      });

      try {
        const current = await codeRepo.findById(codeId);
        if (current) {
          await codeRepo.update(codeId, {
            metadata: {
              ...((current.metadata as Record<string, unknown>) ?? {}),
              renderingQcScore: deepReport.overallScore,
              renderingQcPassed: deepReport.passed,
              renderingQcChecks: deepReport.checks.map((c) => ({
                name: c.name,
                passed: c.passed,
                score: c.score,
                details: c.details,
              })),
            },
          });
        }
      } catch (updateErr) {
        logger.warn('Deep QC metadata update failed', {
          projectId,
          codeId,
          error: updateErr instanceof Error ? updateErr.message : String(updateErr),
        });
      }
    })
    .catch(async (qcErr) => {
      logger.warn('Deep QC failed', {
        projectId,
        codeId,
        error: qcErr instanceof Error ? qcErr.stack : String(qcErr),
      });
      eventBus.emit({
        type: 'QC_REPORT_FAILED',
        payload: {
          projectId,
          stage: 'deep' as const,
          error: qcErr instanceof Error ? qcErr.message : String(qcErr),
        },
      });
      try {
        const current = await codeRepo.findById(codeId);
        if (current) {
          await codeRepo.update(codeId, {
            metadata: {
              ...((current.metadata as Record<string, unknown>) ?? {}),
              deepQcFailed: true,
            },
          });
        }
      } catch (updateErr) {
        logger.warn('Deep QC failure metadata update failed', {
          codeId,
          error: updateErr instanceof Error ? updateErr.message : String(updateErr),
        });
      }
    });
}
