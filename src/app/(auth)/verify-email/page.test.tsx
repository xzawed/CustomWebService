// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import VerifyEmailPage from './page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=test-token'),
}));

describe('VerifyEmailPage', () => {
  it('토큰이 있으면 API 호출 후 인증 완료 메시지를 보여준다', async () => {
    render(<VerifyEmailPage />);
    await waitFor(() => expect(screen.getByText(/이메일 인증 완료/)).toBeTruthy());
  });

  it('인증 완료 후 대시보드 링크를 보여준다', async () => {
    render(<VerifyEmailPage />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /대시보드로 이동/ });
      expect(link).toBeTruthy();
    });
  });
});
