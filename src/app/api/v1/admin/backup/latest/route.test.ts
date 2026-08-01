import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ForbiddenError } from '@/lib/utils/errors';

const { verifyAdminKeyMock, sendSlackAlertMock, getClientIpMock } = vi.hoisted(() => ({
  verifyAdminKeyMock: vi.fn(),
  sendSlackAlertMock: vi.fn().mockResolvedValue(undefined),
  getClientIpMock: vi.fn(() => '203.0.113.9'),
}));

vi.mock('@/lib/utils/adminAuth', () => ({
  adminCorsHeaders: { 'Access-Control-Allow-Origin': 'https://xzawed.xyz' },
  verifyAdminKey: verifyAdminKeyMock,
  withAdminCors: (res: Response): Response => res,
}));

vi.mock('@/lib/monitoring/slackAlert', () => ({
  sendSlackAlert: sendSlackAlertMock,
}));

vi.mock('@/lib/auth/rateLimit', () => ({
  getClientIp: getClientIpMock,
}));

// getBackupConfig는 실제 모듈을 쓰되 SQLITE_BACKUP_DIR로 테스트 dir를 가리킨다.
import { GET } from './route';

describe('GET /api/v1/admin/backup/latest', () => {
  let backupDir: string;
  let prevBackupDir: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdminKeyMock.mockImplementation(() => undefined);
    sendSlackAlertMock.mockResolvedValue(undefined);
    getClientIpMock.mockReturnValue('203.0.113.9');

    backupDir = mkdtempSync(join(tmpdir(), 'admin-backup-dl-'));
    prevBackupDir = process.env.SQLITE_BACKUP_DIR;
    process.env.SQLITE_BACKUP_DIR = backupDir;
  });

  afterEach(() => {
    if (prevBackupDir === undefined) {
      delete process.env.SQLITE_BACKUP_DIR;
    } else {
      process.env.SQLITE_BACKUP_DIR = prevBackupDir;
    }
    rmSync(backupDir, { recursive: true, force: true });
  });

  function makeRequest(url = 'http://localhost/api/v1/admin/backup/latest'): Request {
    return new Request(url, {
      headers: { Authorization: 'Bearer test-admin-key' },
    });
  }

  it('관리자 인증 실패 시 403을 반환한다', async () => {
    verifyAdminKeyMock.mockImplementation(() => {
      throw new ForbiddenError('관리자 인증이 필요합니다');
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('백업이 없으면 404를 반환한다', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('백업 디렉터리를 읽을 수 없으면 503을 반환한다', async () => {
    process.env.SQLITE_BACKUP_DIR = join(backupDir, 'does-not-exist');
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('가장 최근 app-<timestamp>.db 만 내려주고 Content-Disposition·Length를 맞춘다', async () => {
    writeFileSync(join(backupDir, 'app-20260625-100000.db'), 'older-dump');
    writeFileSync(join(backupDir, 'app-20260625-140000.db'), 'newest-dump-content');
    writeFileSync(join(backupDir, 'app.db-wal'), 'not-a-backup');
    writeFileSync(join(backupDir, 'notes.txt'), 'ignore');

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="app-20260625-140000.db"'
    );
    expect(res.headers.get('Content-Length')).toBe(String(Buffer.byteLength('newest-dump-content')));

    const text = await res.text();
    expect(text).toBe('newest-dump-content');

    // 감사 로그 경로: Slack info + client IP
    expect(sendSlackAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        fields: expect.objectContaining({
          filename: 'app-20260625-140000.db',
          clientIp: '203.0.113.9',
        }),
      })
    );
    expect(getClientIpMock).toHaveBeenCalled();
  });

  it('클라이언트 제공 파일명을 쓰지 않는다(쿼리·경로 순회 시도 무시)', async () => {
    writeFileSync(join(backupDir, 'app-20260625-140000.db'), 'safe-dump');
    // 악의적 이름 파일이 디렉터리에 있어도 패턴 불일치로 선택되지 않음
    const nested = join(backupDir, 'evil');
    mkdirSync(nested);
    writeFileSync(join(nested, 'secret.db'), 'nope');

    const res = await GET(
      makeRequest(
        'http://localhost/api/v1/admin/backup/latest?file=../../../etc/passwd&name=evil/secret.db'
      )
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="app-20260625-140000.db"'
    );
    expect(await res.text()).toBe('safe-dump');
  });

  it('GET 핸들러 시그니처는 request 하나만 받는다(경로 파라미터 없음)', () => {
    // 라우트 파일에 [filename] 동적 세그먼트가 없고, 핸들러 arity=1
    expect(GET.length).toBe(1);
  });

  it('Slack 알림 실패가 다운로드 응답을 깨지 않는다', async () => {
    writeFileSync(join(backupDir, 'app-20260625-140000.db'), 'ok');
    sendSlackAlertMock.mockRejectedValue(new Error('webhook down'));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    // 거부가 void catch로 흡수되도록 마이크로태스크 소진
    await new Promise((r) => setTimeout(r, 0));
  });
});
