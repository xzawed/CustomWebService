import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? '';
  if (raw.length < 32) {
    throw new Error('ENCRYPTION_KEY 환경변수가 32자 이상이어야 합니다.');
  }
  return Buffer.from(raw.slice(0, 32), 'utf8');
}

/** 평문 API 키를 암호화하여 저장용 문자열로 반환 */
export function encryptApiKey(plaintext: string): string {
  const iv = randomBytes(16);
  const key = getKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // 형식: iv(hex):tag(hex):ciphertext(hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/** 저장된 암호화 문자열에서 원본 API 키를 복원 */
export function decryptApiKey(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('잘못된 암호화 형식입니다.');
  const [ivHex, tagHex, encHex] = parts;
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8');
}

/** 프론트엔드에 표시용으로 키를 마스킹 (앞 4자리만 노출) */
export function maskApiKey(plaintext: string): string {
  if (plaintext.length <= 4) return '****';
  return plaintext.slice(0, 4) + '*'.repeat(Math.min(plaintext.length - 4, 20));
}
