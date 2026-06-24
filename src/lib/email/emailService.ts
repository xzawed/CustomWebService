import { logger } from '@/lib/utils/logger';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'CustomWebService <onboarding@resend.dev>';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

async function send({ to, subject, html }: SendArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // dev/test 폴백: 외부 발송 없이 로그만 남긴다.
    logger.info('Email (no-op, RESEND_API_KEY 미설정)', { to, subject });
    return;
  }
  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM;
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    logger.error('Email 발송 실패', { to, subject, status: res.status });
    throw new Error(`Email 발송 실패 (status ${res.status})`);
  }
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  await send({
    to,
    subject: '[CustomWebService] 이메일 인증을 완료해주세요',
    html: `<p>아래 버튼을 눌러 이메일 인증을 완료해주세요. 링크는 24시간 후 만료됩니다.</p>
<p><a href="${verifyUrl}">이메일 인증하기</a></p>
<p>버튼이 동작하지 않으면 다음 주소를 브라우저에 붙여넣으세요:<br>${verifyUrl}</p>`,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await send({
    to,
    subject: '[CustomWebService] 비밀번호 재설정',
    html: `<p>아래 버튼을 눌러 비밀번호를 재설정하세요. 링크는 1시간 후 만료됩니다.</p>
<p><a href="${resetUrl}">비밀번호 재설정</a></p>
<p>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>`,
  });
}
