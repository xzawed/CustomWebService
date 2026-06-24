// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignupPage from './page';

describe('SignupPage', () => {
  it('가입 성공 시 이메일 확인 안내를 보여준다', async () => {
    render(<SignupPage />);
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'pw12345678' } });
    fireEvent.click(screen.getByRole('button', { name: /가입/ }));
    await waitFor(() => expect(screen.getByText(/이메일.*인증/)).toBeTruthy());
  });
});
