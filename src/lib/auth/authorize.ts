import { ForbiddenError } from '@/lib/utils/errors';

/**
 * 리소스 소유권을 검증합니다. 소유자가 아니면 ForbiddenError를 던집니다.
 *
 * Supabase 모드: RLS가 DB 레벨에서 소유권을 강제합니다.
 * Postgres 모드: RLS 없음 — 이 함수가 애플리케이션 레벨 보안 경계입니다.
 *
 * @param resource 소유권 필드를 가진 리소스 객체
 * @param requestingUserId 요청을 수행하는 사용자 ID
 * @throws ForbiddenError resource.userId !== requestingUserId 인 경우
 */
export function assertOwner(
  resource: { userId: string },
  requestingUserId: string
): void {
  if (resource.userId !== requestingUserId) {
    throw new ForbiddenError();
  }
}
