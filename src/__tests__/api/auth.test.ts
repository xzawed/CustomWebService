import { describe, it, expect, vi, beforeEach } from 'vitest';

// authService를 모킹해 라우트 계층(검증·상태코드·레이트리밋)만 검증한다.
const signup = vi.fn();
const verifyEmail = vi.fn();
const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();
const resendVerification = vi.fn();
const isFeatureEnabled = vi.fn((_name: string) => true);

vi.mock('@/services/factory', () => ({
  createAuthService: () => ({ signup, verifyEmail, requestPasswordReset, resetPassword, resendVerification }),
}));

vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

// 가입 킬스위치 — 기본 true(정상 흐름). 개별 테스트에서 false로 내려 503 분기를 검증한다.
vi.mock('@/lib/config/featureFlags', () => ({
  isFeatureEnabled: (name: string) => isFeatureEnabled(name) as boolean,
}));

import { POST as signupPOST } from '@/app/api/v1/auth/signup/route';
import { POST as verifyPOST } from '@/app/api/v1/auth/verify-email/route';
import { POST as forgotPOST } from '@/app/api/v1/auth/forgot-password/route';
import { POST as resetPOST } from '@/app/api/v1/auth/reset-password/route';
import { POST as resendPOST } from '@/app/api/v1/auth/resend-verification/route';
import { getAuthUser } from '@/lib/auth/index';

function jsonReq(url: string, body: unknown, ip = '9.9.9.9'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

function emptyReq(url: string, ip = '9.9.9.9'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 다른 테스트로 mock 값이 새지 않도록 킬스위치 기본값을 매 테스트 복구한다.
    isFeatureEnabled.mockReturnValue(true);
  });

  it('signup 성공 시 201', async () => {
    signup.mockResolvedValue({ userId: 'u1' });
    const res = await signupPOST(jsonReq('https://app/api/v1/auth/signup', { email: 'a@b.com', password: 'pw12345678' }, `ip-${Math.random()}`));
    expect(res.status).toBe(201);
    expect(signup).toHaveBeenCalledWith('a@b.com', 'pw12345678', 'https://app');
  });

  it('enable_signup=false이면 503 SIGNUP_DISABLED이고 signup을 호출하지 않는다', async () => {
    isFeatureEnabled.mockReturnValue(false);

    const res = await signupPOST(
      jsonReq(
        'https://app/api/v1/auth/signup',
        { email: 'a@b.com', password: 'pw12345678' },
        `ip-${Math.random()}`,
      ),
    );

    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('SIGNUP_DISABLED');
    expect(isFeatureEnabled).toHaveBeenCalledWith('enable_signup');
    expect(signup).not.toHaveBeenCalled();
  });

  it('enable_signup=true이면 정상 가입 흐름이 진행된다', async () => {
    isFeatureEnabled.mockReturnValue(true);
    signup.mockResolvedValue({ userId: 'u1' });

    const res = await signupPOST(
      jsonReq(
        'https://app/api/v1/auth/signup',
        { email: 'ok@b.com', password: 'pw12345678' },
        `ip-${Math.random()}`,
      ),
    );

    expect(res.status).toBe(201);
    expect(isFeatureEnabled).toHaveBeenCalledWith('enable_signup');
    expect(signup).toHaveBeenCalledWith('ok@b.com', 'pw12345678', 'https://app');
  });

  it('signup 입력 검증 실패 시 400', async () => {
    const res = await signupPOST(jsonReq('https://app/api/v1/auth/signup', { email: 'bad', password: 'x' }, `ip-${Math.random()}`));
    expect(res.status).toBe(400);
  });

  it('signup 중복은 409', async () => {
    const { ConflictError } = await import('@/lib/utils/errors');
    signup.mockRejectedValue(new ConflictError('이미 가입된 이메일입니다.'));
    const res = await signupPOST(jsonReq('https://app/api/v1/auth/signup', { email: 'a@b.com', password: 'pw12345678' }, `ip-${Math.random()}`));
    expect(res.status).toBe(409);
  });

  it('verify-email 성공 200', async () => {
    verifyEmail.mockResolvedValue(undefined);
    const res = await verifyPOST(jsonReq('https://app/api/v1/auth/verify-email', { token: 'abc' }));
    expect(res.status).toBe(200);
  });

  it('forgot-password는 항상 200(존재 여부 무관)', async () => {
    requestPasswordReset.mockResolvedValue(undefined);
    const res = await forgotPOST(jsonReq('https://app/api/v1/auth/forgot-password', { email: 'none@b.com' }, `ip-${Math.random()}`));
    expect(res.status).toBe(200);
  });

  describe('reset-password', () => {
    it('성공 시 200 과 메시지를 반환하고 resetPassword(token, password)를 호출한다', async () => {
      resetPassword.mockResolvedValue(undefined);
      const res = await resetPOST(
        jsonReq('https://app/api/v1/auth/reset-password', { token: 'tok123', password: 'newpass123' }),
      );
      expect(res.status).toBe(200);
      expect(resetPassword).toHaveBeenCalledWith('tok123', 'newpass123');
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('바디 없음(bad JSON) 시 400을 반환한다', async () => {
      const res = await resetPOST(
        jsonReq('https://app/api/v1/auth/reset-password', { token: '' }),
      );
      expect(res.status).toBe(400);
      expect(resetPassword).not.toHaveBeenCalled();
    });

    it('필수 필드 누락 시 400을 반환한다', async () => {
      const res = await resetPOST(
        jsonReq('https://app/api/v1/auth/reset-password', { password: 'newpass123' }),
      );
      expect(res.status).toBe(400);
      expect(resetPassword).not.toHaveBeenCalled();
    });
  });

  describe('resend-verification', () => {
    it('미인증 요청이면 401을 반환한다', async () => {
      vi.mocked(getAuthUser).mockResolvedValue(null);
      const res = await resendPOST(emptyReq('https://app/api/v1/auth/resend-verification', `ip-${Math.random()}`));
      expect(res.status).toBe(401);
      expect(resendVerification).not.toHaveBeenCalled();
    });

    it('인증된 요청이면 200을 반환하고 resendVerification(userId, origin)을 호출한다', async () => {
      vi.mocked(getAuthUser).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: null,
        avatarUrl: null,
      } as never);
      resendVerification.mockResolvedValue(undefined);

      const res = await resendPOST(emptyReq('https://app/api/v1/auth/resend-verification', `ip-${Math.random()}`));
      expect(res.status).toBe(200);
      expect(resendVerification).toHaveBeenCalledWith('user-1', 'https://app');
    });
  });
});
