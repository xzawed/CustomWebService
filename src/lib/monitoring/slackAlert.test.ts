import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendSlackAlert } from './slackAlert';

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('sendSlackAlert', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    delete process.env.SLACK_WEBHOOK_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SLACK_WEBHOOK_URL;
  });

  it('SLACK_WEBHOOK_URL 미설정 시 fetch를 호출하지 않는다', async () => {
    await sendSlackAlert({ level: 'error', title: '테스트', message: '내용' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('SLACK_WEBHOOK_URL 설정 시 올바른 엔드포인트로 POST 요청을 보낸다', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await sendSlackAlert({ level: 'info', title: '제목', message: '메시지' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://hooks.slack.com/test',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('HTTP 실패 응답 시 에러를 던지지 않는다', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(
      sendSlackAlert({ level: 'error', title: '에러', message: '내용' }),
    ).resolves.toBeUndefined();
  });

  it('fetch 예외 시 에러를 던지지 않는다', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    fetchSpy.mockRejectedValueOnce(new Error('네트워크 오류'));

    await expect(
      sendSlackAlert({ level: 'warning', title: '경고', message: '내용' }),
    ).resolves.toBeUndefined();
  });

  it('fields와 level 이모지가 전송 텍스트에 포함된다', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await sendSlackAlert({
      level: 'error',
      title: '제목',
      message: '메시지',
      fields: { '실패 횟수': 5, '임계값': 3 },
    });

    const call = fetchSpy.mock.calls[0];
    const body = JSON.parse(call[1]!.body as string) as { text: string };
    expect(body.text).toContain(':red_circle:');
    expect(body.text).toContain('실패 횟수');
    expect(body.text).toContain('5');
  });
});
