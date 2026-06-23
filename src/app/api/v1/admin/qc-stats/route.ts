import { createCodeRepository, createEventRepository } from '@/repositories/factory';
import { adminCorsHeaders, verifyAdminKey, withAdminCors } from '@/lib/utils/adminAuth';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: adminCorsHeaders });
}

export async function GET(request: Request): Promise<Response> {
  const res = await (async () => {
    try {
      verifyAdminKey(request);

      const url = new URL(request.url);
      const daysRaw = parseInt(url.searchParams.get('days') ?? '7', 10);
      const days = Number.isNaN(daysRaw) || daysRaw <= 0 ? 7 : daysRaw;
      const now = new Date();
      const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      // raw .from 대신 레포 경유(모든 provider). 집계 메서드는 DB 오류를 throw하므로
      // 장애가 0-메트릭으로 은폐되지 않고 outer try/catch → 500으로 surface된다.
      const codeRepo = createCodeRepository();
      const eventRepo = createEventRepository();
      const [codes, failureCount, stage3FallbackCount, stageSkippedPayloads, qualityLoopPayloads] =
        await Promise.all([
          codeRepo.findMetadataByDateRange(from),
          eventRepo.countByTypeSince('CODE_GENERATION_FAILED', from),
          eventRepo.countByTypeSince('STAGE3_FALLBACK_USED', from),
          eventRepo.findPayloadsByTypeSince('STAGE_SKIPPED', from),
          eventRepo.findPayloadsByTypeSince('QUALITY_LOOP_COMPLETED', from),
        ]);

      const stageSkippedRows = stageSkippedPayloads as Array<{ stage?: string } | null>;
      const stage2SkipCount = stageSkippedRows.filter((p) => p?.stage === 'stage2').length;
      const stage3SkipCount = stageSkippedRows.filter((p) => p?.stage === 'stage3').length;
      const qualityLoopRows = qualityLoopPayloads as Array<{ iterations?: number; improved?: boolean } | null>;
      const qualityLoopEventCount = qualityLoopRows.length;
      const sumIterations = qualityLoopRows.reduce((s, p) => s + (typeof p?.iterations === 'number' ? p.iterations : 0), 0);
      const improvedCount = qualityLoopRows.filter((p) => p?.improved === true).length;
      const avgQualityLoopIterations = qualityLoopEventCount > 0 ? Math.round((sumIterations / qualityLoopEventCount) * 100) / 100 : 0;
      const qualityLoopImprovementRate = qualityLoopEventCount > 0 ? Math.round((improvedCount / qualityLoopEventCount) * 100) / 100 : 0;
      const total = codes.length;
      if (total === 0) {
        return jsonResponse({
          success: true,
          data: {
            period: { from: from.toISOString().split('T')[0], to: now.toISOString().split('T')[0], days },
            totalGenerations: 0,
            failureCount,
            realSuccessRate: 0,
            avgStructuralScore: 0,
            avgMobileScore: 0,
            avgRenderingQcScore: 0,
            qcPassRate: 0,
            qualityLoopUsageRate: 0,
            stage3FallbackCount,
            stage2SkipCount,
            stage3SkipCount,
            avgQualityLoopIterations,
            qualityLoopImprovementRate,
            commonFailures: [],
          },
        });
      }

      let sumStructural = 0;
      let sumMobile = 0;
      let sumQc = 0;
      let qcCount = 0;
      let passCount = 0;
      let loopUsedCount = 0;
      let deepQcFailedCount = 0;
      const failureCounts = new Map<string, number>();

      for (const code of codes) {
        const meta = code.metadata as Record<string, unknown> | null;
        if (!meta) continue;

        if (typeof meta.structuralScore === 'number') sumStructural += meta.structuralScore;
        if (typeof meta.mobileScore === 'number') sumMobile += meta.mobileScore;
        if (typeof meta.renderingQcScore === 'number') {
          sumQc += meta.renderingQcScore;
          qcCount++;
        }
        if (meta.renderingQcPassed === true) passCount++;
        if (meta.qualityLoopUsed === true) loopUsedCount++;
        if (meta.deepQcFailed === true) deepQcFailedCount++;

        const checks = meta.renderingQcChecks as Array<{ name: string; passed: boolean }> | undefined;
        if (checks) {
          for (const check of checks) {
            if (!check.passed) {
              failureCounts.set(check.name, (failureCounts.get(check.name) ?? 0) + 1);
            }
          }
        }
      }

      const commonFailures = [...failureCounts.entries()]
        .map(([check, failCount]) => ({
          check,
          failCount,
          rate: Math.round((failCount / total) * 100) / 100,
        }))
        .sort((a, b) => b.failCount - a.failCount)
        .slice(0, 10);

      const totalAttempts = total + failureCount;
      return jsonResponse({
        success: true,
        data: {
          period: { from: from.toISOString().split('T')[0], to: now.toISOString().split('T')[0], days },
          totalGenerations: total,
          failureCount,
          realSuccessRate: totalAttempts > 0 ? Math.round((total / totalAttempts) * 100) / 100 : 1,
          avgStructuralScore: Math.round((sumStructural / total) * 10) / 10,
          avgMobileScore: Math.round((sumMobile / total) * 10) / 10,
          avgRenderingQcScore: qcCount > 0 ? Math.round((sumQc / qcCount) * 10) / 10 : 0,
          qcPassRate: qcCount > 0 ? Math.round((passCount / qcCount) * 100) / 100 : 0,
          qualityLoopUsageRate: Math.round((loopUsedCount / total) * 100) / 100,
          deepQcFailedCount,
          stage3FallbackCount,
          stage3FallbackRate: totalAttempts > 0 ? Math.round((stage3FallbackCount / totalAttempts) * 100) / 100 : 0,
          stage2SkipCount,
          stage3SkipCount,
          stage2SkipRate: total > 0 ? Math.round((stage2SkipCount / total) * 100) / 100 : 0,
          stage3SkipRate: total > 0 ? Math.round((stage3SkipCount / total) * 100) / 100 : 0,
          avgQualityLoopIterations,
          qualityLoopImprovementRate,
          commonFailures,
        },
      });
    } catch (error) {
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}
