import type { AuthUser } from '@/lib/auth/types';

export type { AuthUser };

/**
 * 현재 요청의 인증 사용자(단일 관리자)를 반환합니다.
 * Auth.js Credentials + JWT(무상태) 단일 스택 — 미인증 시 null.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const { getLocalAuthUser } = await import('@/lib/auth/local-auth');
  return getLocalAuthUser();
}
