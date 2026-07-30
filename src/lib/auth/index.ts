import type { AuthUser } from '@/lib/auth/types';
import { createUserRepository } from '@/repositories/factory';
import { logger } from '@/lib/utils/logger';

export type { AuthUser };

/**
 * 현재 요청의 인증 사용자를 반환합니다.
 * Auth.js Credentials + JWT(무상태) — 미인증·삭제된 사용자는 null.
 *
 * JWT만 신뢰하면 삭제된 계정의 토큰이 살아 있는 동안 "유령 세션"이 된다
 * (`GET /projects` → 200 + [], 쓰기 시 FK 500, `assertEmailVerified` → 403 오인).
 * 세션 해석 후 users PK 조회(인덱스 1회)로 행 존재를 확인한다.
 * 임베디드 SQLite 단일 인스턴스에서 비용은 미미하고, 삭제·탈취 세션 차단이 목적이다.
 * 이 조회를 "최적화"로 제거하지 말 것 — middleware(Edge) 경로에는 두지 않는다
 * (middleware는 local-auth-edge만 쓰며 여기 factory/SQLite에 닿지 않는다).
 *
 * DB 오류 시 fail-closed(null). 인증 경계에서는 fail-open으로 통과시키는 것보다
 * 일시 장애로 401이 낫다(레이트리밋의 fail-open과 의도적으로 다름).
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const { getLocalAuthUser } = await import('@/lib/auth/local-auth');
  const sessionUser = await getLocalAuthUser();
  if (!sessionUser) return null;

  try {
    const dbUser = await createUserRepository().findById(sessionUser.id);
    if (!dbUser) return null;

    // JWT 스냅샷이 아니라 DB 현재 값을 쓴다(이메일 변경 등 이후 토큰이 오래 살아도 정합).
    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name ?? null,
      avatarUrl: dbUser.avatarUrl ?? null,
    };
  } catch (err: unknown) {
    logger.error('getAuthUser: user lookup failed — treating as unauthenticated', {
      userId: sessionUser.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
