// @vitest-environment happy-dom
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { VerifyEmailBanner } from './VerifyEmailBanner';

afterEach(() => {
  vi.clearAllMocks();
});

describe('VerifyEmailBanner', () => {
  it('미인증 상태일 때 배너를 렌더링한다', async () => {
    // 기본 핸들러가 verified: false를 반환
    await act(async () => {
      render(<VerifyEmailBanner />);
    });
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeTruthy();
    });
    expect(screen.queryByText('인증 메일 재발송')).toBeTruthy();
  });

  it('인증 완료 상태일 때 아무것도 렌더링하지 않는다', async () => {
    server.use(
      http.get('*/api/v1/auth/status', () =>
        HttpResponse.json({ success: true, data: { verified: true } }),
      ),
    );
    await act(async () => {
      render(<VerifyEmailBanner />);
    });
    await waitFor(() => {
      // verified: true이면 배너 없음 (초기 null 상태도 없으므로 대기 후 확인)
      expect(screen.queryByRole('alert')).toBeFalsy();
    });
  });

  it('fetch 실패 시 아무것도 렌더링하지 않는다', async () => {
    server.use(
      http.get('*/api/v1/auth/status', () => HttpResponse.error()),
    );
    await act(async () => {
      render(<VerifyEmailBanner />);
    });
    // fetch 실패 → verified null → 배너 미표시
    expect(screen.queryByRole('alert')).toBeFalsy();
  });

  it('"인증 메일 재발송" 버튼 클릭 시 재발송 요청을 보내고 완료 메시지를 표시한다', async () => {
    await act(async () => {
      render(<VerifyEmailBanner />);
    });
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeTruthy();
    });

    const button = screen.getByRole('button', { name: '인증 메일 재발송' });
    await act(async () => {
      button.click();
    });

    await waitFor(() => {
      expect(screen.queryByText('인증 메일을 다시 보냈습니다. 받은편지함을 확인해 주세요.')).toBeTruthy();
    });
  });
});
