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

  /** 제출 후 "버튼이 다시 눌리는 상태 + 에러 문구 표시"를 함께 단언한다. */
  async function expectRecoverableError(): Promise<void> {
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /로그인/ });
      expect(button.hasAttribute('disabled')).toBe(false);
    });
    // credError는 role=alert 없는 plain div → 문구 매처로 확인한다.
    expect(screen.getByText(/오류|실패|잠시 후|다시 시도/)).toBeTruthy();
  }

  function submit(): void {
    const emailInput = screen.getByLabelText('이메일');
    fireEvent.change(emailInput, { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'hunter2' } });
    fireEvent.submit(emailInput.closest('form')!);
  }

  // ⚠️ **이 테스트가 진짜 네트워크 실패 경로다.** 이전 버전은 `mockRejectedValue`로 목킹했는데
  // 그건 **실제 라이브러리가 하지 않는 동작**이었다(next-auth 5.0.0-beta.32 실측):
  //
  //   fetch 실패 → `fetchData`가 `catch { logger.error(...); return null }`로 삼킴
  //   → `getProviders()`가 null → `signIn`은 `window.location.href='/api/auth/error'`만 쓰고
  //     **`return;`** — 즉 **undefined로 resolve**한다(reject 아님).
  //
  // 그래서 reject를 목킹한 테스트는 초록이었지만 **프로덕션 시나리오는 재현하지 못했다.**
  // undefined를 성공으로 읽으면 `/dashboard`로 갔다가 세션이 없어 로그인으로 되돌아온다 —
  // 원인 표시가 없는 왕복이 된다. `AUTH_TRUST_HOST` 누락으로 `/api/auth/*`가 500일 때도 같다.
  //
  // ⚠️ **이 단언을 "사용자가 에러 문구를 본다"로 읽지 말 것**(2026-08-08 감사 지적).
  // `res === undefined`는 **항상** signIn이 `location.href='/api/auth/error'`를 이미 쓴 뒤다.
  // happy-dom은 실제 이동을 하지 않아 여기서는 문구가 보이지만, 실제 브라우저는 그 페이지로 간다.
  //
  // 그래서 이 수정의 **실제 프로덕션 효과**는 문구 노출이 아니라 이것이다:
  //   수정 전: signIn의 이동을 `location.assign('/dashboard')`가 덮어씀 → 세션 없어 로그인으로
  //            되돌아옴 = **원인 없는 왕복**
  //   수정 후: 덮어쓰지 않음 → **`/api/auth/error`에 착지**(무슨 일이 났는지는 최소한 드러난다)
  // 단언이 지키는 것은 **그 fall-through가 없다는 것**이다. 문구 노출은 목의 부산물이다.
  it('signIn이 undefined로 resolve하면 성공 경로로 빠지지 않는다 (에러 상태로 전이 + 버튼 복구)', async () => {
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    try {
      mocks.signIn.mockResolvedValue(undefined);
      renderComponent(<LoginPage />);
      submit();
      await expectRecoverableError();
      // 핵심 단언 — 성공 경로(`/dashboard` 이동)로 빠지지 않았다. **이것이 실제로 고쳐진 것이다.**
      expect(assign).not.toHaveBeenCalled();
    } finally {
      assign.mockRestore();
    }
  });

  // 좁지만 실재하는 경로: providers·csrf는 성공하고 **callback만 실패**하면
  // `new URL(data.url)`이 TypeError를 던져 signIn이 실제로 reject한다.
  it('signIn이 거부되면(callback 단독 실패) 에러를 표시하고 버튼을 되살린다', async () => {
    mocks.signIn.mockRejectedValue(new TypeError('Invalid URL'));
    renderComponent(<LoginPage />);
    submit();
    await expectRecoverableError();
  });

  // 대조군 — 자격증명 오류는 **다른 문구**여야 한다. 같은 문구를 쓰면 사용자가 비밀번호를
  // 의심하며 재시도해 계정 스로틀만 소모한다.
  it('자격증명 오류 문구와 도달 실패 문구는 서로 다르다', async () => {
    mocks.signIn.mockResolvedValue({ error: 'CredentialsSignin' });
    renderComponent(<LoginPage />);
    submit();

    await waitFor(() => {
      expect(screen.getByText('이메일 또는 비밀번호가 올바르지 않습니다.')).toBeTruthy();
    });
    expect(screen.queryByText(/네트워크 상태를 확인/)).toBeNull();
  });
});
