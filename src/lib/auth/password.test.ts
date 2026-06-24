import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('해시 후 같은 비밀번호로 검증 성공', () => {
    const stored = hashPassword('s3cret-pass');
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(verifyPassword('s3cret-pass', stored)).toBe(true);
  });
  it('틀린 비밀번호는 검증 실패', () => {
    const stored = hashPassword('s3cret-pass');
    expect(verifyPassword('wrong', stored)).toBe(false);
  });
  it('stored가 없거나 형식이 깨지면 false', () => {
    expect(verifyPassword('x', null)).toBe(false);
    expect(verifyPassword('x', undefined)).toBe(false);
    expect(verifyPassword('x', 'nocolon')).toBe(false);
  });
});
