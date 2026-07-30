// Auth.js v5 Credentials + JWT 무상태 세션 (DB 어댑터 없음) — 유일한 인증 스택.
// authorize는 DB 사용자(users)를 조회해 사용자별 비밀번호 해시를 검증한다(다중 사용자).
// 로그인 스로틀은 이 Node 설정에만 둔다(middleware/edge로 끌어오지 말 것).
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyPassword } from '@/lib/auth/password';
import {
  clearKey,
  getClientIp,
  isLimited,
  recordFailure,
} from '@/lib/auth/rateLimit';
import {
  LOGIN_ACCOUNT_FAIL_LIMIT,
  LOGIN_ACCOUNT_WINDOW_MS,
  LOGIN_IP_FAIL_LIMIT,
  LOGIN_IP_WINDOW_MS,
} from '@/lib/config/rateLimit';
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

/**
 * 로그인 스로틀 + 자격증명 검증.
 *
 * - 계정 버킷은 **제출 이메일**(정규화) 기준 — 존재 여부 비노출
 * - 실패만 기록, 성공 시 이메일 키만 제거(IP 키는 유지)
 * - 한도 초과 시 DB/scrypt 전에 null (클라이언트가 잘못된 비밀번호와 구분 불가)
 */
export async function authorizeWithLoginRateLimit(
  email: string,
  password: string,
  request: Request,
  deps: AuthorizeDeps,
): Promise<{ id: string; email: string; name?: string } | null> {
  const normalized = email.trim().toLowerCase();
  const ip = getClientIp(request);
  const ipKey = `login:ip:${ip}`;
  const emailKey = `login:email:${normalized}`;

  if (
    isLimited(ipKey, LOGIN_IP_FAIL_LIMIT) ||
    isLimited(emailKey, LOGIN_ACCOUNT_FAIL_LIMIT)
  ) {
    return null;
  }

  const user = await authorizeCredentials(normalized, password, deps);

  if (user) {
    clearKey(emailKey);
    return user;
  }

  recordFailure(ipKey, LOGIN_IP_WINDOW_MS);
  recordFailure(emailKey, LOGIN_ACCOUNT_WINDOW_MS);
  return null;
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...localAuthBaseConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize(credentials, request) {
        const email = typeof credentials?.email === 'string' ? credentials.email : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        const repo = createUserRepository();
        return authorizeWithLoginRateLimit(email, password, request, {
          findByEmail: (e) => repo.findByEmail(e),
        });
      },
    }),
  ],
});
