import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthUser } from '@/lib/auth/types';

/**
 * 단일 관리자(셀프호스트) 자격증명 검증 — AUTH_PROVIDER=local 경로.
 *
 * 비밀번호는 env(`ADMIN_PASSWORD_HASH`)에 scrypt 해시("salt:hash" hex)로 보관하고,
 * 평문은 어디에도 저장하지 않는다. 검증은 timing-safe 비교를 사용한다.
 * 관리자 신원은 `users.id`(FK 앵커)와 일치해야 하므로 고정 id를 사용한다.
 */

const SCRYPT_KEYLEN = 64;

/** 비밀번호를 scrypt 해시로 변환한다. 반환: "salt:hash"(hex). 관리자 비번 설정 시 1회 사용. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

/** 평문 비밀번호가 저장된 "salt:hash"와 일치하는지 timing-safe 비교한다. */
export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(hash, 'hex');
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  return timingSafeEqual(actual, expected);
}

/** 단일 관리자 users.id (FK 앵커). 관리자 users 행 시드와 일치해야 한다. env로 재정의 가능. */
export function getAdminUserId(): string {
  return process.env.ADMIN_USER_ID ?? '00000000-0000-0000-0000-000000000001';
}

/**
 * 단일 관리자 자격증명을 검증한다 (Auth.js Credentials authorize에서 호출).
 * `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH`(env)와 대조해 일치 시 관리자 AuthUser, 아니면 null.
 */
export function verifyAdminCredentials(email: string, password: string): AuthUser | null {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminHash = process.env.ADMIN_PASSWORD_HASH;
  if (!adminEmail || !adminHash) return null;

  const emailMatches = email.trim().toLowerCase() === adminEmail.trim().toLowerCase();
  const passwordMatches = verifyPassword(password, adminHash);
  if (!emailMatches || !passwordMatches) return null;

  return {
    id: getAdminUserId(),
    email: adminEmail,
    name: process.env.ADMIN_NAME ?? 'Admin',
    avatarUrl: null,
  };
}
