import { createServiceClient } from '@/lib/supabase/server';
import { CodeRepository } from '@/repositories/codeRepository';
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

      const supabase = await createServiceClient();
      const codeRepo = new CodeRepository(supabase);
      const [codes, failureCountResult, stage3FallbackResult, stageSkippedResult, qualityLoopResult] = await Promise.all([
        codeRepo.findMetadataByDateRange(from),
        supabase
          .from('platform_events')
          .select('id', { count: 'exact', head: true })
          .eq('type', 'CODE_GENERATION_FAILED')
          .gte('created_at', from.toISOString()),
        supabase
          .from('platform_events')
          .select('id', { count: 'exact', head: true })
          .eq('type', 'STAGE3_FALLBACK_USED')
          .gte('created_at', from.toISOString()),
        supabase
          .from('platform_events')
          .select('payload')
          .eq('type', 'STAGE_SKIPPED')
          .gte('created_at', from.toISOString()),
        supabase
          .from('platform_events')
          .select('payload')
          .eq('type', 'QUALITY_LOOP_COMPLETED')
          .gte('created_at', from.toISOString()),
      ]);

      // Supabase 쿼리 에러를 검사한다. 무시하면 count/data가 0·빈배열로 폴백되어 DB 장애 시에도
      // 정상(0 메트릭)으로 보고되는 은폐가 발생한다 → 에러를 surface하여 500으로 응답.
      const queryError =
        failureCountResult.error ??
        stage3FallbackResult.error ??
        stageSkippedResult.error ??
        qualityLoopResult.error;
      if (queryError) throw queryError;

      const failureCount = failureCountResult.count ?? 0;
      const stage3FallbackCount = stage3FallbackResult.count ?? 0;
      const stageSkippedRows = (stageSkippedResult.data ?? []) as Array<{ payload: { stage?: string } | null }>;
      const stage2SkipCount = stageSkippedRows.filter((r) => r.payload?.stage === 'stage2').length;
      const stage3SkipCount = stageSkippedRows.filter((r) => r.payload?.stage === 'stage3').length;
      const qualityLoopRows = (qualityLoopResult.data ?? []) as Array<{ payload: { iterations?: number; improved?: boolean } | null }>;
      const qualityLoopEventCount = qualityLoopRows.length;
      const sumIterations = qualityLoopRows.reduce((s, r) => s + (typeof r.payload?.iterations === 'number' ? r.payload.iterations : 0), 0);
      const improvedCount = qualityLoopRows.filter((r) => r.payload?.improved === true).length;
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
