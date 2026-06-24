import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendVerificationEmail } from './emailService';

describe('emailService', () => {
  const orig = { ...process.env };
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => { process.env = { ...orig }; });

  it('RESEND_API_KEY 미설정 시 fetch를 호출하지 않는다(no-op)', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await sendVerificationEmail('u@example.com', 'https://x/verify?token=abc');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('RESEND_API_KEY 설정 시 Resend API로 POST한다', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    process.env.EMAIL_FROM = 'App <no-reply@xzawed.xyz>';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'e1' }), { status: 200 }));
    await sendVerificationEmail('u@example.com', 'https://x/verify?token=abc');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe('u@example.com');
    expect(body.from).toBe('App <no-reply@xzawed.xyz>');
    expect(body.html).toContain('https://x/verify?token=abc');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test_key' });
  });
});
