import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  verifyAdminCredentials,
  getAdminUserId,
} from './adminCredentials';

describe('hashPassword / verifyPassword', () => {
  it('해시 round-trip이 검증된다', () => {
    const stored = hashPassword('s3cret-pw');
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(verifyPassword('s3cret-pw', stored)).toBe(true);
  });

  it('틀린 비밀번호는 거부한다', () => {
    const stored = hashPassword('correct');
    expect(verifyPassword('wrong', stored)).toBe(false);
  });

  it('손상/빈 저장값은 false', () => {
    expect(verifyPassword('x', undefined)).toBe(false);
    expect(verifyPassword('x', '')).toBe(false);
    expect(verifyPassword('x', 'no-colon')).toBe(false);
    expect(verifyPassword('x', 'salt:nothex!')).toBe(false);
  });
});

describe('verifyAdminCredentials', () => {
  const ORIG = { ...process.env };
  beforeEach(() => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD_HASH = hashPassword('hunter2');
  });
  afterEach(() => {
    process.env = { ...ORIG };
  });

  it('이메일·비번 일치 시 관리자 AuthUser 반환', () => {
    const u = verifyAdminCredentials('admin@example.com', 'hunter2');
    expect(u).not.toBeNull();
    expect(u?.email).toBe('admin@example.com');
    expect(u?.id).toBe(getAdminUserId());
    expect(u?.name).toBe('Admin');
  });

  it('이메일은 대소문자·공백 무시', () => {
    expect(verifyAdminCredentials('  ADMIN@Example.com ', 'hunter2')).not.toBeNull();
  });

  it('틀린 비번/이메일은 null', () => {
    expect(verifyAdminCredentials('admin@example.com', 'wrong')).toBeNull();
    expect(verifyAdminCredentials('other@example.com', 'hunter2')).toBeNull();
  });

  it('env 미설정 시 null (로그인 비활성)', () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD_HASH;
    expect(verifyAdminCredentials('admin@example.com', 'hunter2')).toBeNull();
  });
});
