'use client';

import { useEffect, useState } from 'react';

export function VerifyEmailBanner() {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/status');
        if (!res.ok) return;
        const json = (await res.json()) as { success: boolean; data: { verified: boolean } };
        if (json.success) setVerified(json.data.verified);
      } catch {
        // fetch 실패 시 배너 미표시
      }
    })();
  }, []);

  if (verified !== false) return null;

  async function handleResend() {
    setSending(true);
    try {
      await fetch('/api/v1/auth/resend-verification', { method: 'POST' });
      setSent(true);
    } catch {
      // 실패 시 무시
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="alert"
      className="mb-4 flex items-center justify-between rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
    >
      <span>
        {sent
          ? '인증 메일을 다시 보냈습니다. 받은편지함을 확인해 주세요.'
          : '이메일 인증이 필요합니다. 받은편지함에서 인증 메일을 확인해 주세요.'}
      </span>
      {!sent && (
        <button
          onClick={handleResend}
          disabled={sending}
          className="ml-4 shrink-0 font-medium underline underline-offset-2 disabled:opacity-50"
        >
          {sending ? '전송 중…' : '인증 메일 재발송'}
        </button>
      )}
    </div>
  );
}
