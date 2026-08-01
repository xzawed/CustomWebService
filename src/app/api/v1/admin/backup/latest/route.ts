import { createReadStream, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { getClientIp } from '@/lib/auth/rateLimit';
import { getBackupConfig, selectLatestBackupFilename } from '@/lib/db/sqlite/backup';
import { sendSlackAlert } from '@/lib/monitoring/slackAlert';
import { adminCorsHeaders, verifyAdminKey, withAdminCors } from '@/lib/utils/adminAuth';
import { AppError, handleApiError, jsonResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/backup/latest
 *
 * 가장 최근 on-volume `.backup()` 덤프를 내려받는다(오프-볼륨 DR의 제로 계정 완화).
 * **시스템에서 가장 민감한 단일 아티팩트** — 전체 사용자·scrypt 해시·암호화 API 키·생성 코드.
 *
 * 보안 속성:
 * - `verifyAdminKey` (Bearer ADMIN_API_KEY) + admin CORS
 * - 클라이언트 파일명 미수신 — 서버가 `BACKUP_FILE_REGEX`/`selectLatestBackupFilename`으로만 선택
 * - 감사: `logger.warn` + Slack info (void+catch, 응답을 깨지 않음)
 * - IP는 `getClientIp()` 단일 출처(XFF 최우측)
 */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: adminCorsHeaders });
}

export async function GET(request: Request): Promise<Response> {
  const res = await (async () => {
    try {
      verifyAdminKey(request);

      // 경로 파라미터·쿼리의 파일명은 절대 쓰지 않는다(순회 차단).
      const { dir } = getBackupConfig();

      let files: string[];
      try {
        files = readdirSync(dir);
      } catch (err: unknown) {
        logger.warn('Admin backup download: backup dir unreadable', {
          dir,
          error: err instanceof Error ? err.message : String(err),
        });
        return jsonResponse(
          {
            success: false,
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: '백업 디렉터리를 읽을 수 없습니다',
            },
          },
          { status: 503 }
        );
      }

      const filename = selectLatestBackupFilename(files);
      if (!filename) {
        throw new AppError('NOT_FOUND', '백업이 아직 없습니다', 404);
      }

      // basename만 join — 목록에서 고른 값이라 `..` 등이 들어올 수 없다(BACKUP_FILE_REGEX).
      const absolutePath = join(dir, filename);
      const { size } = statSync(absolutePath);
      const clientIp = getClientIp(request);

      // 전체 DB 유출 경로 — 성공 다운로드도 warn 감사 로그
      logger.warn('Admin backup download', {
        filename,
        bytes: size,
        clientIp,
      });

      // 경보 실패가 다운로드 응답을 깨면 안 됨 — 스케줄러와 동일 void+catch
      void Promise.resolve(
        sendSlackAlert({
          level: 'info',
          title: '관리자 DB 백업 다운로드',
          message: '전체 SQLite 덤프가 관리자 API로 다운로드되었습니다. 키 유출 가능성을 점검하세요.',
          fields: {
            filename,
            bytes: size,
            clientIp,
          },
        })
      ).catch((alertErr: unknown) => {
        logger.warn('Admin backup download alert failed', {
          error: alertErr instanceof Error ? alertErr.message : String(alertErr),
        });
      });

      const nodeStream = createReadStream(absolutePath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(size),
        },
      });
    } catch (error) {
      return handleApiError(error);
    }
  })();
  return withAdminCors(res);
}
