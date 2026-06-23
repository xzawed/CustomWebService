import { createRequire } from 'node:module';
import { adminCorsHeaders, verifyAdminKey, withAdminCors } from '@/lib/utils/adminAuth';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';

const req = createRequire(import.meta.url);

function tryRequire(id: string): string {
  try {
    req(id);
    return 'ok';
  } catch (e) {
    return `FAIL: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
  }
}

/**
 * 생성 파이프라인 모듈 로드 진단 엔드포인트.
 * 500 오류 원인 규명용 — npm 패키지가 standalone node_modules에 존재하는지 확인.
 */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: adminCorsHeaders });
}

export async function GET(request: Request): Promise<Response> {
  const res = await (async () => {
    try {
      verifyAdminKey(request);

      return jsonResponse({
        success: true,
        data: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          nodeEnv: process.env.NODE_ENV,
          modules: {
            'playwright-core': tryRequire('playwright-core'),
            '@anthropic-ai/sdk': tryRequire('@anthropic-ai/sdk'),
            'better-sqlite3': tryRequire('better-sqlite3'),
            'drizzle-orm': tryRequire('drizzle-orm'),
          },
        },
      });
    } catch (error) {
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}
