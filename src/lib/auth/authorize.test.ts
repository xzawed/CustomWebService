import { describe, it, expect } from 'vitest';
import { assertOwner } from './authorize';
import { ForbiddenError } from '@/lib/utils/errors';

describe('assertOwner()', () => {
  it('소유자 ID가 일치하면 에러 없이 통과한다', () => {
    expect(() => assertOwner({ userId: 'user-1' }, 'user-1')).not.toThrow();
  });

  it('소유자 ID가 다르면 ForbiddenError를 던진다', () => {
    expect(() => assertOwner({ userId: 'user-1' }, 'user-2')).toThrow(ForbiddenError);
  });

  it('요청자 ID가 빈 문자열이면 ForbiddenError를 던진다', () => {
    expect(() => assertOwner({ userId: 'user-1' }, '')).toThrow(ForbiddenError);
  });

  it('리소스 userId가 빈 문자열이고 요청자도 빈 문자열이면 통과한다', () => {
    expect(() => assertOwner({ userId: '' }, '')).not.toThrow();
  });
});
