import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEYLEN = 64;

/** 비밀번호를 scrypt 해시로 변환한다. 반환: "salt:hash"(hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

/** 평문 비밀번호가 저장된 "salt:hash"와 일치하는지 timing-safe 비교한다. */
export function verifyPassword(password: string, stored: string | undefined | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  return timingSafeEqual(actual, expected);
}
