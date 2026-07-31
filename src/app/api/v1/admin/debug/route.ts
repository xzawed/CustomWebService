import { createRequire } from 'node:module';
import { adminCorsHeaders, verifyAdminKey, withAdminCors } from '@/lib/utils/adminAuth';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';
import { describeTaskModels } from '@/providers/ai/AiProviderFactory';

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
          // env 값만으로는 실제 적용 모델을 알 수 없다 — 허용목록에 없는 값은 조용히
          // 기본값으로 폴백한다. `fellBack`이 true면 env가 무시되고 있다는 뜻이다.
          models: describeTaskModels(),
          // 이메일 발송 설정 여부. `RESEND_API_KEY`가 없으면 `emailService`가 조용히
          // no-op이 되고, 그러면 이메일 인증이 영원히 완료되지 않아 `assertEmailVerified()`가
          // generate·regenerate·deploy를 403으로 막는다 — **신규 사용자가 제품을 아예 못 쓴다.**
          // 그런데 그 상태를 밖에서 관측할 방법이 없어 Railway 콘솔을 봐야만 알 수 있었다.
          // ⚠️ 값은 절대 노출하지 않는다. 설정 여부(boolean)와 발신 도메인만 노출한다.
          email: {
            configured: Boolean(process.env.RESEND_API_KEY),
            // 빈 문자열이면 Resend가 발송을 거부하므로 미설정과 구분해서 본다.
            fromSet: Boolean(process.env.EMAIL_FROM),
            fromDomain: process.env.EMAIL_FROM?.split('@')[1] ?? null,
          },
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
