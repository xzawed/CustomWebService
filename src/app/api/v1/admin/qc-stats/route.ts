import { createServiceClient } from '@/lib/supabase/server';
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
      const days = parseInt(url.searchParams.get('days') ?? '7', 10);
      const now = new Date();
      const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      const supabase = await createServiceClient();

      const { data: codes, error } = await supabase
        .from('generated_codes')
        .select('metadata, created_at')
        .gte('created_at', from.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const total = codes?.length ?? 0;
      if (total === 0) {
        return jsonResponse({
          success: true,
          data: {
            period: { from: from.toISOString().split('T')[0], to: now.toISOString().split('T')[0], days },
            totalGenerations: 0,
            avgStructuralScore: 0,
            avgMobileScore: 0,
            avgRenderingQcScore: 0,
            qcPassRate: 0,
            qualityLoopUsageRate: 0,
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
      const failureCounts = new Map<string, number>();

      for (const code of codes!) {
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

      return jsonResponse({
        success: true,
        data: {
          period: { from: from.toISOString().split('T')[0], to: now.toISOString().split('T')[0], days },
          totalGenerations: total,
          avgStructuralScore: Math.round((sumStructural / total) * 10) / 10,
          avgMobileScore: Math.round((sumMobile / total) * 10) / 10,
          avgRenderingQcScore: qcCount > 0 ? Math.round((sumQc / qcCount) * 10) / 10 : 0,
          qcPassRate: qcCount > 0 ? Math.round((passCount / qcCount) * 100) / 100 : 0,
          qualityLoopUsageRate: Math.round((loopUsedCount / total) * 100) / 100,
          commonFailures,
        },
      });
    } catch (error) {
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}
