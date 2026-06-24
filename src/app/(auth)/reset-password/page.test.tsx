// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ResetPasswordPage from './page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=test-token'),
}));

describe('ResetPasswordPage', () => {
  it('초기에는 새 비밀번호 입력 폼을 렌더링한다', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByLabelText('새 비밀번호')).toBeTruthy();
    expect(screen.getByRole('button', { name: /비밀번호 재설정/ })).toBeTruthy();
  });

  it('제출 성공 시 성공 메시지와 로그인 링크를 보여준다', async () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText('새 비밀번호'), {
      target: { value: 'newpassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /비밀번호 재설정/ }));
    await waitFor(() =>
      expect(screen.getByText(/비밀번호가 성공적으로 재설정/)).toBeTruthy(),
    );
    expect(screen.getByRole('link', { name: /로그인/ })).toBeTruthy();
  });
});
