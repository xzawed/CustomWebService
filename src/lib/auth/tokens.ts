import { randomBytes, createHash } from 'node:crypto';
import type { AuthTokenType, IAuthTokenRepository } from '@/repositories/interfaces';

export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** 토큰 원문 → SHA-256 hex (DB 저장·조회용). */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** 랜덤 토큰을 발급하고 해시를 저장한다. 원문(이메일 링크용)을 반환한다. */
export async function issueToken(
  repo: IAuthTokenRepository,
  userId: string,
  type: AuthTokenType,
  ttlMs: number,
): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await repo.create(userId, hashToken(raw), type, expiresAt);
  return raw;
}

/** 원문 토큰을 검증하고 일회성으로 소비한다. 유효하면 userId, 아니면 null. */
export async function verifyAndConsumeToken(
  repo: IAuthTokenRepository,
  raw: string,
  type: AuthTokenType,
): Promise<string | null> {
  const now = new Date().toISOString();
  const found = await repo.findValidByHash(hashToken(raw), type, now);
  if (!found) return null;
  await repo.consume(found.id, now);
  return found.userId;
}
