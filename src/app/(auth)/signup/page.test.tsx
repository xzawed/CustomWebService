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

  // ⚠️ 이 테스트는 한때 `(KNOWN-DEFECT)` 라는 이름과 *"수정 전까지 FAIL이 정상이다"* 라는
  // 주석을 달고 있었는데, **수정(#292의 try/catch/finally)이 같은 커밋에 함께 들어와서**
  // 이름이 붙은 순간부터 초록이었다. 즉 테스트 이름이 **검증하면 바로 거짓인 단정**을 달고
  // 러너 출력에 영구히 남았다 — 다음 세션이 그 이름만 보고 "가입 결함이 아직 열려 있다"고
  // 보고하거나, 주석을 믿고 정상 코드를 되돌릴 수 있었다(2026-08-08 감사에서 발견).
  //
  // `KNOWN-DEFECT` 라벨은 **지금 잘못된 동작을 고정할 때만** 쓴다
  // (`builder/page.test.tsx`의 용법이 정본). 고쳤으면 라벨을 떼고 **고쳐진 동작**을 서술한다.
  // 어떤 lint도 이 라벨을 검사하지 않는다 — 리뷰로만 지켜진다.
  it('fetch가 거부되면(네트워크 실패) 에러를 표시하고 버튼을 되살린다', async () => {
    server.use(
      http.post('*/api/v1/auth/signup', () => HttpResponse.error()),
    );

    render(<SignupPage />);
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'pw12345678' } });
    fireEvent.click(screen.getByRole('button', { name: /가입/ }));

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /가입/ });
      expect(button.hasAttribute('disabled')).toBe(false);
    });
    // 문구가 정해졌으므로 관용 매처를 쓰지 않는다 — 관용 매처는 서버 오류 문구
    // ('가입 중 오류가 발생했습니다')와도 매치돼 **도달 실패를 구분하지 못한다.**
    expect(screen.getByText(/가입 요청에 실패했습니다/)).toBeTruthy();
  });

  // 통제군 — 위 단언이 "아무 에러 문구나" 잡는 게 아님을 보인다.
  // 서버가 4xx로 응답하는 경로는 **다른 문구**여야 한다(도달 실패와 구분 불가하면 안 된다).
  it('서버 오류 문구와 네트워크 도달 실패 문구는 서로 다르다', async () => {
    server.use(
      http.post('*/api/v1/auth/signup', () =>
        HttpResponse.json({ error: { message: '이미 가입된 이메일입니다.' } }, { status: 409 }),
      ),
    );

    render(<SignupPage />);
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'dup@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'pw12345678' } });
    fireEvent.click(screen.getByRole('button', { name: /가입/ }));

    await waitFor(() => expect(screen.getByText(/이미 가입된 이메일입니다/)).toBeTruthy());
    expect(screen.queryByText(/가입 요청에 실패했습니다/)).toBeNull();
  });
});
