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
    findValidByHash: vi.fn(async (tokenHash, type) => {
      const r = rows.find((x) => x.tokenHash === tokenHash && x.type === type && !x.consumed);
      return r ? { id: r.id as string, userId: r.userId as string } : null;
    }),
    consume: vi.fn(async (id) => {
      const r = rows.find((x) => x.id === id);
      if (r) r.consumed = true;
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

  it('잘못된 토큰은 null', async () => {
    const repo = fakeRepo();
    expect(await verifyAndConsumeToken(repo, 'bogus', 'email_verify')).toBeNull();
  });
});
