import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './authService';

/* eslint-disable @typescript-eslint/no-explicit-any */

type FakeUser = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  emailVerified: string | null;
};

function makeDeps() {
  const users = new Map<string, FakeUser>();
  const userRepo = {
    findByEmail: vi.fn(async (email: string) => [...users.values()].find((u) => u.email === email) ?? null),
    findById: vi.fn(async (id: string) => users.get(id) ?? null),
    create: vi.fn(async (input: { email: string; passwordHash: string | null; emailVerified: string | null; name: string | null }) => {
      const u: FakeUser = { id: `u${users.size + 1}`, ...input, name: input.name ?? null };
      users.set(u.id, u);
      return u;
    }),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const u = users.get(id)!;
      Object.assign(u, patch);
      return u;
    }),
  };
  const tokenRepo = {
    create: vi.fn(async () => {}),
    consumeValid: vi.fn(async (): Promise<string | null> => null),
    invalidateByUserAndType: vi.fn(async () => {}),
  };
  const email = {
    sendVerificationEmail: vi.fn(async () => {}),
    sendPasswordResetEmail: vi.fn(async () => {}),
  };
  return { userRepo, tokenRepo, email, users };
}

describe('AuthService.signup', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: AuthService;
  beforeEach(() => {
    deps = makeDeps();
    svc = new AuthService(deps.userRepo as any, deps.tokenRepo as any, deps.email as any);
  });

  it('새 이메일로 가입하면 미인증 사용자 생성 + 인증 메일 발송', async () => {
    const { userId } = await svc.signup('new@example.com', 'pw12345678', 'https://app');
    const created = deps.users.get(userId)!;
    expect(created.email).toBe('new@example.com');
    expect(created.emailVerified).toBeNull();
    expect(created.passwordHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(deps.email.sendVerificationEmail).toHaveBeenCalledOnce();
    const [, url] = deps.email.sendVerificationEmail.mock.calls[0] as unknown as [string, string];
    expect(url).toContain('https://app/verify-email?token=');
  });

  it('중복 이메일은 ConflictError', async () => {
    await svc.signup('dup@example.com', 'pw12345678', 'https://app');
    await expect(svc.signup('dup@example.com', 'pw12345678', 'https://app')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('AuthService.verifyEmail', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: AuthService;
  beforeEach(() => {
    deps = makeDeps();
    svc = new AuthService(deps.userRepo as any, deps.tokenRepo as any, deps.email as any);
  });

  it('유효하지 않은 토큰은 ValidationError', async () => {
    deps.tokenRepo.consumeValid.mockResolvedValue(null);
    await expect(svc.verifyEmail('bad-token')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('유효한 토큰이면 사용자 emailVerified 업데이트', async () => {
    const { userId } = await svc.signup('user@example.com', 'pw12345678', 'https://app');
    deps.tokenRepo.consumeValid.mockResolvedValue(userId);
    await svc.verifyEmail('valid-token');
    const user = deps.users.get(userId)!;
    expect(user.emailVerified).not.toBeNull();
    expect(deps.tokenRepo.consumeValid).toHaveBeenCalled();
  });
});

describe('AuthService.resendVerification', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: AuthService;
  beforeEach(() => {
    deps = makeDeps();
    svc = new AuthService(deps.userRepo as any, deps.tokenRepo as any, deps.email as any);
  });

  it('미존재 userId는 no-op (throw 없음)', async () => {
    deps.userRepo.findById.mockResolvedValue(null);
    await expect(svc.resendVerification('no-such-id', 'https://app')).resolves.toBeUndefined();
    expect(deps.email.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('이미 인증된 사용자는 no-op', async () => {
    const { userId } = await svc.signup('user@example.com', 'pw12345678', 'https://app');
    const user = deps.users.get(userId)!;
    user.emailVerified = new Date().toISOString();
    deps.email.sendVerificationEmail.mockClear();
    await svc.resendVerification(userId, 'https://app');
    expect(deps.email.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('미인증 사용자에게 인증 메일 재발송', async () => {
    const { userId } = await svc.signup('user@example.com', 'pw12345678', 'https://app');
    deps.email.sendVerificationEmail.mockClear();
    await svc.resendVerification(userId, 'https://app');
    expect(deps.email.sendVerificationEmail).toHaveBeenCalledOnce();
    const [, url] = deps.email.sendVerificationEmail.mock.calls[0] as unknown as [string, string];
    expect(url).toContain('https://app/verify-email?token=');
  });
});

describe('AuthService.requestPasswordReset', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: AuthService;
  beforeEach(() => {
    deps = makeDeps();
    svc = new AuthService(deps.userRepo as any, deps.tokenRepo as any, deps.email as any);
  });

  it('존재하지 않는 이메일 — 조용히 성공 (enumeration 방지)', async () => {
    await expect(svc.requestPasswordReset('unknown@example.com', 'https://app')).resolves.toBeUndefined();
    expect(deps.email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('존재하는 이메일 — 리셋 메일 발송 + 기존 토큰 무효화', async () => {
    await svc.signup('user@example.com', 'pw12345678', 'https://app');
    await svc.requestPasswordReset('user@example.com', 'https://app');
    expect(deps.email.sendPasswordResetEmail).toHaveBeenCalledOnce();
    const [, url] = deps.email.sendPasswordResetEmail.mock.calls[0] as unknown as [string, string];
    expect(url).toContain('https://app/reset-password?token=');
    expect(deps.tokenRepo.invalidateByUserAndType).toHaveBeenCalled();
  });
});

describe('AuthService.resetPassword', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: AuthService;
  beforeEach(() => {
    deps = makeDeps();
    svc = new AuthService(deps.userRepo as any, deps.tokenRepo as any, deps.email as any);
  });

  it('유효하지 않은 토큰은 ValidationError', async () => {
    deps.tokenRepo.consumeValid.mockResolvedValue(null);
    await expect(svc.resetPassword('bad-token', 'newPw12345678')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('유효한 토큰이면 비밀번호 업데이트 + 리셋 토큰 전체 무효화', async () => {
    const { userId } = await svc.signup('user@example.com', 'pw12345678', 'https://app');
    deps.tokenRepo.consumeValid.mockResolvedValue(userId);
    await svc.resetPassword('valid-token', 'newPw12345678');
    const user = deps.users.get(userId)!;
    expect(user.passwordHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    const calls = deps.tokenRepo.invalidateByUserAndType.mock.calls as unknown as Array<[string, string, string]>;
    expect(calls.some(([, type]) => type === 'password_reset')).toBe(true);
  });
});
