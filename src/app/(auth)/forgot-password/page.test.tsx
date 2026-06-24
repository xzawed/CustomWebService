// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ForgotPasswordPage from './page';

describe('ForgotPasswordPage', () => {
  it('제출 시 generic 이메일 발송 안내를 보여준다', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /재설정 링크 받기/ }));
    await waitFor(() => expect(screen.getByText(/이메일을 보냈습니다/)).toBeTruthy());
  });

  it('초기에는 폼을 렌더링한다', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByLabelText('이메일')).toBeTruthy();
    expect(screen.getByRole('button', { name: /재설정 링크 받기/ })).toBeTruthy();
  });
});
