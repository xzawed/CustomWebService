import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const VALID_KEY = 'a'.repeat(32);

describe('encryptApiKey / decryptApiKey', () => {
  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_KEY', VALID_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('라운드트립: 암호화 후 복호화하면 원본을 반환한다', async () => {
    const { encryptApiKey, decryptApiKey } = await import('./encryption');
    const original = 'my-secret-api-key-12345';
    const encrypted = encryptApiKey(original);
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(original);
  });

  it('동일 입력도 호출마다 다른 암호문을 생성한다 (IV 랜덤성)', async () => {
    const { encryptApiKey } = await import('./encryption');
    const plaintext = 'same-key';
    const enc1 = encryptApiKey(plaintext);
    const enc2 = encryptApiKey(plaintext);
    expect(enc1).not.toBe(enc2);
  });

  it('암호문 형식은 iv:tag:ciphertext (콜론 2개)이다', async () => {
    const { encryptApiKey } = await import('./encryption');
    const encrypted = encryptApiKey('test');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    // iv는 16바이트 → hex 32자
    expect(parts[0]).toHaveLength(32);
    // tag는 16바이트 → hex 32자
    expect(parts[1]).toHaveLength(32);
  });

  it('decryptApiKey에 잘못된 형식 입력 시 에러를 던진다', async () => {
    const { decryptApiKey } = await import('./encryption');
    expect(() => decryptApiKey('invalid-format')).toThrow('잘못된 암호화 형식입니다.');
  });

  it('decryptApiKey에 파트가 2개인 문자열도 에러를 던진다', async () => {
    const { decryptApiKey } = await import('./encryption');
    expect(() => decryptApiKey('part1:part2')).toThrow('잘못된 암호화 형식입니다.');
  });
});

describe('encryptApiKey — 환경변수 검증', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('ENCRYPTION_KEY 미설정 시 에러를 던진다', async () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    vi.resetModules();
    const { encryptApiKey } = await import('./encryption');
    expect(() => encryptApiKey('test')).toThrow('ENCRYPTION_KEY 환경변수가 32바이트 이상이어야 합니다.');
  });

  it('ENCRYPTION_KEY 32자 미만 시 에러를 던진다', async () => {
    vi.stubEnv('ENCRYPTION_KEY', 'short');
    vi.resetModules();
    const { encryptApiKey } = await import('./encryption');
    expect(() => encryptApiKey('test')).toThrow('ENCRYPTION_KEY 환경변수가 32바이트 이상이어야 합니다.');
  });
});

describe('maskApiKey', () => {
  it('5자 이상 키는 앞 4자리 + 별표로 마스킹한다', async () => {
    vi.stubEnv('ENCRYPTION_KEY', VALID_KEY);
    const { maskApiKey } = await import('./encryption');
    // 'sk-abcdefgh' = 11자 → 앞 4자리 + 별표 (11-4=7)개
    const result = maskApiKey('sk-abcdefgh');
    expect(result).toBe('sk-a' + '*'.repeat(7));
    vi.unstubAllEnvs();
  });

  it('4자 이하 키는 ****을 반환한다', async () => {
    const { maskApiKey } = await import('./encryption');
    expect(maskApiKey('abc')).toBe('****');
    expect(maskApiKey('abcd')).toBe('****');
  });

  it('빈 문자열은 ****을 반환한다', async () => {
    const { maskApiKey } = await import('./encryption');
    expect(maskApiKey('')).toBe('****');
  });

  it('별표 최대 20자 제한을 지킨다', async () => {
    vi.stubEnv('ENCRYPTION_KEY', VALID_KEY);
    const { maskApiKey } = await import('./encryption');
    // 30자 입력 → 앞 4자 + 별표 20자 (max)
    const result = maskApiKey('a'.repeat(30));
    expect(result).toBe('aaaa' + '*'.repeat(20));
    vi.unstubAllEnvs();
  });
});
