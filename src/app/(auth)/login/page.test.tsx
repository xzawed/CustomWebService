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

  it('회원가입·비밀번호 찾기 링크가 있다', () => {
    renderComponent(<LoginPage />);
    const signupLink = screen.getByRole('link', { name: /회원가입/ });
    const forgotLink = screen.getByRole('link', { name: /비밀번호/ });
    expect(signupLink.getAttribute('href')).toBe('/signup');
    expect(forgotLink.getAttribute('href')).toBe('/forgot-password');
  });

  // KNOWN-DEFECT: handleCredentialsLogin에서 setCredLoading(true) 후 signIn(line 26)이
  // reject되면 try/catch/finally가 없어 credLoading이 true로 남고 에러도 안 보인다.
  // 수정 전까지 이 테스트는 FAIL이 정상이다.
  it('signIn이 거부되면(네트워크 실패) 버튼이 영구 비활성화되고 에러도 표시되지 않는다 (KNOWN-DEFECT)', async () => {
    mocks.signIn.mockRejectedValue(new Error('network down'));
    renderComponent(<LoginPage />);

    const emailInput = screen.getByLabelText('이메일');
    fireEvent.change(emailInput, { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'hunter2' } });
    fireEvent.submit(emailInput.closest('form')!);

    // 기대: 네트워크 실패 후에도 버튼이 다시 활성화되고 에러가 보여야 한다.
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /로그인/ });
      expect(button.hasAttribute('disabled')).toBe(false);
    });
    // credError는 role=alert 없는 plain div. 의도 문구는 아직 미정 → 관용 매처.
    expect(screen.getByText(/오류|실패|잠시 후|다시 시도/)).toBeTruthy();
  });
});
