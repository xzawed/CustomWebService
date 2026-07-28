import { describe, it, expect, vi } from 'vitest';
import { hashToken, issueToken, verifyAndConsumeToken, EMAIL_VERIFY_TTL_MS } from './tokens';
import type { IAuthTokenRepository } from '@/repositories/interfaces';

function fakeRepo(): IAuthTokenRepository & { rows: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    create: vi.fn(async (userId, tokenHash, type, expiresAt) => {
      rows.push({ id: `t${rows.length}`, userId, tokenHash, type, expiresAt, consumed: false });
    }),
    // 원자적 소비: 조건 검사와 상태 변경이 같은 동기 블록에서 일어난다.
    consumeValid: vi.fn(async (tokenHash, type, now) => {
      const r = rows.find(
        (x) =>
          x.tokenHash === tokenHash &&
          x.type === type &&
          !x.consumed &&
          (x.expiresAt as string) > now,
      );
      if (!r) return null;
      r.consumed = true;
      return r.userId as string;
    }),
    invalidateByUserAndType: vi.fn(async () => {}),
  };
}

describe('tokens', () => {
  it('발급한 원문 토큰의 해시가 저장되고, 같은 원문으로 검증·소비된다', async () => {
    const repo = fakeRepo();
    const raw = await issueToken(repo, 'user-1', 'email_verify', EMAIL_VERIFY_TTL_MS);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    expect(repo.rows[0].tokenHash).toBe(hashToken(raw));

    const userId = await verifyAndConsumeToken(repo, raw, 'email_verify');
    expect(userId).toBe('user-1');
    // 재사용 불가(소비됨)
    expect(await verifyAndConsumeToken(repo, raw, 'email_verify')).toBeNull();
  });

  it('조회·소비를 나누지 않고 consumeValid를 한 번만 호출한다', async () => {
    // 2단계로 되돌아가면(조회 → await → 소비) 그 사이에 다른 요청이 끼어들어
    // 같은 토큰이 두 번 소비될 수 있다. 원자성의 실체는 SQL의
    // `WHERE consumed_at IS NULL`이고, 이 테스트는 호출부가 그 원자 연산을
    // 우회하지 않는다는 계약을 고정한다(실 SQLite 검증은 레포 테스트에 있다).
    const repo = fakeRepo();
    const raw = await issueToken(repo, 'user-1', 'email_verify', EMAIL_VERIFY_TTL_MS);
    await verifyAndConsumeToken(repo, raw, 'email_verify');
    expect(repo.consumeValid).toHaveBeenCalledTimes(1);
  });

  it('만료된 토큰은 소비되지 않는다', async () => {
    const repo = fakeRepo();
    const raw = await issueToken(repo, 'user-1', 'email_verify', -1000);
    expect(await verifyAndConsumeToken(repo, raw, 'email_verify')).toBeNull();
  });

  it('타입이 다르면 소비되지 않는다', async () => {
    const repo = fakeRepo();
    const raw = await issueToken(repo, 'user-1', 'email_verify', EMAIL_VERIFY_TTL_MS);
    expect(await verifyAndConsumeToken(repo, raw, 'password_reset')).toBeNull();
  });

  it('잘못된 토큰은 null', async () => {
    const repo = fakeRepo();
    expect(await verifyAndConsumeToken(repo, 'bogus', 'email_verify')).toBeNull();
  });
});
