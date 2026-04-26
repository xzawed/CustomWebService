import { logger } from '@/lib/utils/logger';

export interface SlackAlertOptions {
  level: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  fields?: Record<string, string | number>;
}

const LEVEL_EMOJI: Record<SlackAlertOptions['level'], string> = {
  error: ':red_circle:',
  warning: ':warning:',
  info: ':information_source:',
};

/**
 * SLACK_WEBHOOK_URL 환경변수가 설정된 경우 Slack 알림을 전송합니다.
 * 미설정이면 no-op (서버 로그만 출력).
 */
export async function sendSlackAlert(opts: SlackAlertOptions): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('SLACK_WEBHOOK_URL 미설정 — Slack 알림 스킵', { title: opts.title });
    return;
  }

  const emoji = LEVEL_EMOJI[opts.level];
  const fieldLines = opts.fields
    ? Object.entries(opts.fields).map(([k, v]) => `• *${k}*: ${v}`).join('\n')
    : '';

  const text = [
    `${emoji} *${opts.title}*`,
    opts.message,
    fieldLines,
    `_환경: ${process.env.NODE_ENV ?? 'unknown'} | ${new Date().toISOString()}_`,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      logger.warn('Slack 알림 전송 실패', { status: res.status, title: opts.title });
    }
  } catch (err) {
    logger.warn('Slack 알림 전송 오류', { error: err instanceof Error ? err.message : String(err) });
  }
}
