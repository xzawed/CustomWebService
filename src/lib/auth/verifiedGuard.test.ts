import { describe, it, expect, vi } from 'vitest';

const findById = vi.fn();
vi.mock('@/repositories/factory', () => ({ createUserRepository: () => ({ findById }) }));

import { assertEmailVerified } from './verifiedGuard';

describe('assertEmailVerified', () => {
  it('미인증이면 EMAIL_NOT_VERIFIED throw', async () => {
    findById.mockResolvedValue({ id: 'u1', emailVerified: null });
    await expect(assertEmailVerified('u1')).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });
  it('인증됨이면 통과', async () => {
    findById.mockResolvedValue({ id: 'u1', emailVerified: '2026-06-24T00:00:00.000Z' });
    await expect(assertEmailVerified('u1')).resolves.toBeUndefined();
  });
  it('사용자 미존재면 throw', async () => {
    findById.mockResolvedValue(null);
    await expect(assertEmailVerified('u1')).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });
});
