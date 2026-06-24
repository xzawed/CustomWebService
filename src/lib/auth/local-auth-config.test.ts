import { describe, it, expect, vi } from 'vitest';

// NextAuth 및 Credentials Provider는 Node 환경에서 Next.js 런타임이 없으면 모듈 해석 실패.
// authorizeCredentials는 순수 함수이므로 NextAuth를 모킹해 분리 테스트한다.
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() })),
}));
vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn(() => ({})),
}));

import { authorizeCredentials } from './local-auth-config';
import { hashPassword } from './password';

function depsWith(user: { id: string; email: string; name: string | null; passwordHash: string | null }) {
  return { findByEmail: vi.fn(async (email: string) => (email === user.email ? user : null)) };
}

describe('authorizeCredentials', () => {
  const user = { id: 'u-1', email: 'a@example.com', name: 'A', passwordHash: hashPassword('pw12345678') };

  it('이메일·비밀번호 일치 시 사용자 신원 반환', async () => {
    const res = await authorizeCredentials('a@example.com', 'pw12345678', depsWith(user));
    expect(res).toEqual({ id: 'u-1', email: 'a@example.com', name: 'A' });
  });
  it('비밀번호 불일치 시 null', async () => {
    expect(await authorizeCredentials('a@example.com', 'wrong', depsWith(user))).toBeNull();
  });
  it('미존재 이메일 시 null', async () => {
    expect(await authorizeCredentials('none@example.com', 'pw12345678', depsWith(user))).toBeNull();
  });
  it('passwordHash 없는 계정은 null', async () => {
    const u = { ...user, passwordHash: null };
    expect(await authorizeCredentials('a@example.com', 'pw12345678', depsWith(u))).toBeNull();
  });
});
