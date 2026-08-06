// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import SignupPage from './page';

describe('SignupPage', () => {
  it('가입 성공 시 이메일 확인 안내를 보여준다', async () => {
    render(<SignupPage />);
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'pw12345678' } });
    fireEvent.click(screen.getByRole('button', { name: /가입/ }));
    await waitFor(() => expect(screen.getByText(/이메일.*인증/)).toBeTruthy());
  });

  // KNOWN-DEFECT: handleSubmit에서 setLoading(true) 후 fetch(line 20)가 reject되면
  // try/catch/finally가 없어 setLoading(false)(line 25)가 실행되지 않고 에러도 안 보인다.
  // 수정 전까지 이 테스트는 FAIL이 정상이다.
  it('fetch가 거부되면(네트워크 실패) 버튼이 영구 비활성화되고 에러도 표시되지 않는다 (KNOWN-DEFECT)', async () => {
    // 기존 테스트와 동일하게 MSW로 signup fetch를 제어한다 (네트워크 거부).
    server.use(
      http.post('*/api/v1/auth/signup', () => HttpResponse.error()),
    );

    render(<SignupPage />);
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'pw12345678' } });
    fireEvent.click(screen.getByRole('button', { name: /가입/ }));

    // 기대: 네트워크 실패 후에도 버튼이 다시 활성화되고 에러가 보여야 한다.
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /가입/ });
      expect(button.hasAttribute('disabled')).toBe(false);
    });
    // AuthError는 role=alert 없는 plain div. 의도 문구는 아직 미정 → 관용 매처.
    expect(screen.getByText(/오류|실패|잠시 후|다시 시도/)).toBeTruthy();
  });
});
