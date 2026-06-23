// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderComponent, screen, fireEvent, waitFor } from '@/test/helpers/component';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  signIn: mocks.signIn,
}));

import LoginPage from './page';

function setWindowUrl(url: string): void {
  (window as unknown as { happyDOM: { setURL: (nextUrl: string) => void } }).happyDOM.setURL(url);
}

describe('LoginPage local(Credentials) mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setWindowUrl('https://xzawed.xyz/login');
  });

  it('이메일/비밀번호 폼을 렌더하고 OAuth 버튼은 표시하지 않는다', () => {
    renderComponent(<LoginPage />);

    expect(screen.getByLabelText('이메일')).toBeTruthy();
    expect(screen.getByLabelText('비밀번호')).toBeTruthy();
    expect(screen.getByRole('button', { name: '로그인' })).toBeTruthy();
    expect(screen.queryByText('Google로 계속하기')).toBeNull();
    expect(screen.queryByText('GitHub로 계속하기')).toBeNull();
  });

  it('제출 시 credentials signIn을 redirect:false로 호출한다', async () => {
    mocks.signIn.mockResolvedValue({ error: null, ok: true });
    renderComponent(<LoginPage />);

    const emailInput = screen.getByLabelText('이메일');
    fireEvent.change(emailInput, { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'hunter2' } });
    fireEvent.submit(emailInput.closest('form')!);

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith('credentials', {
        email: 'admin@example.com',
        password: 'hunter2',
        redirect: false,
      });
    });
  });

  it('자격증명 오류 시 에러 메시지를 표시한다', async () => {
    mocks.signIn.mockResolvedValue({ error: 'CredentialsSignin' });
    renderComponent(<LoginPage />);

    const emailInput = screen.getByLabelText('이메일');
    fireEvent.change(emailInput, { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'wrong' } });
    fireEvent.submit(emailInput.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('이메일 또는 비밀번호가 올바르지 않습니다.')).toBeTruthy();
    });
  });
});
