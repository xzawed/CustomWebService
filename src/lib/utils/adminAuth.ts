import crypto from 'crypto';
import { ForbiddenError } from '@/lib/utils/errors';

export function verifyAdminKey(request: Request): void {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) {
    throw new ForbiddenError('관리자 인증이 필요합니다');
  }
  const key = header.slice(7);
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    throw new ForbiddenError('ADMIN_API_KEY가 설정되지 않았습니다');
  }
  const keyBuffer = Buffer.from(key);
  const expectedBuffer = Buffer.from(expected);
  if (keyBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(keyBuffer, expectedBuffer)) {
    throw new ForbiddenError('유효하지 않은 관리자 키입니다');
  }
}
