// Auth.js v5 Credentials + JWT 무상태 세션 (DB 어댑터 없음) — 유일한 인증 스택.
// authorize는 DB 사용자(users)를 조회해 사용자별 비밀번호 해시를 검증한다(다중 사용자).
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyPassword } from '@/lib/auth/password';
import { createUserRepository } from '@/repositories/factory';
import { localAuthBaseConfig } from '@/lib/auth/local-auth-base';

interface AuthorizeDeps {
  findByEmail: (
    email: string,
  ) => Promise<{ id: string; email: string; name: string | null; passwordHash: string | null } | null>;
}

/** 순수 함수: 이메일/비밀번호를 DB 사용자와 대조한다. 일치 시 신원, 아니면 null. */
export async function authorizeCredentials(
  email: string,
  password: string,
  deps: AuthorizeDeps,
): Promise<{ id: string; email: string; name?: string } | null> {
  const normalized = email.trim().toLowerCase();
  const user = await deps.findByEmail(normalized);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return { id: user.id, email: user.email, name: user.name ?? undefined };
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...localAuthBaseConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        const repo = createUserRepository();
        return authorizeCredentials(email, password, { findByEmail: (e) => repo.findByEmail(e) });
      },
    }),
  ],
});
