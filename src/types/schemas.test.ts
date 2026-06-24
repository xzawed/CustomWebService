import { describe, it, expect } from 'vitest';
import { signupSchema, resetPasswordSchema } from './schemas';

describe('auth schemas', () => {
  it('이메일을 소문자/trim 정규화한다', () => {
    const r = signupSchema.parse({ email: '  A@Example.COM ', password: 'pw12345678' });
    expect(r.email).toBe('a@example.com');
  });
  it('8자 미만 비밀번호는 거부', () => {
    expect(signupSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false);
  });
  it('reset은 token과 8자 이상 비밀번호 필요', () => {
    expect(resetPasswordSchema.safeParse({ token: 't', password: 'pw12345678' }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: '', password: 'pw12345678' }).success).toBe(false);
  });
});
