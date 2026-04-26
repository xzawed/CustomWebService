import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import { DrizzleUserApiKeyRepository } from '@/repositories/drizzle/DrizzleUserApiKeyRepository';

const NOW = new Date('2026-04-26T00:00:00.000Z');

function makeApiKeyRow(overrides: Partial<typeof schema.userApiKeys.$inferSelect> = {}) {
  return {
    id: 'key-1',
    user_id: 'user-1',
    api_id: 'api-1',
    encrypted_key: 'enc:secret-key',
    is_verified: false,
    verified_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  } as typeof schema.userApiKeys.$inferSelect;
}

function makeMockDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  } as unknown as NodePgDatabase<typeof schema>;
}

describe('DrizzleUserApiKeyRepository', () => {
  let mockDb: ReturnType<typeof makeMockDb>;
  let repo: DrizzleUserApiKeyRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeMockDb();
    repo = new DrizzleUserApiKeyRepository(mockDb);
  });

  // ─── upsert ────────────────────────────────────────────────────────────────
  describe('upsert()', () => {
    it('API 키를 삽입하고 반환한다', async () => {
      const row = makeApiKeyRow();
      const mockReturning = vi.fn().mockResolvedValue([row]);
      const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict });
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      const result = await repo.upsert('user-1', 'api-1', 'enc:secret-key');

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result.id).toBe('key-1');
      expect(result.userId).toBe('user-1');
      expect(result.apiId).toBe('api-1');
      expect(result.encryptedKey).toBe('enc:secret-key');
      expect(result.isVerified).toBe(false);
      expect(result.verifiedAt).toBeNull();
    });

    it('이미 존재하는 키도 업데이트하고 반환한다', async () => {
      const row = makeApiKeyRow({ encrypted_key: 'enc:new-key' });
      const mockReturning = vi.fn().mockResolvedValue([row]);
      const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict });
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      const result = await repo.upsert('user-1', 'api-1', 'enc:new-key');
      expect(result.encryptedKey).toBe('enc:new-key');
    });

    it('toDomain이 verifiedAt을 String으로 변환한다', async () => {
      const verifiedAt = new Date('2026-04-26T10:00:00.000Z');
      const row = makeApiKeyRow({ is_verified: true, verified_at: verifiedAt });
      const mockReturning = vi.fn().mockResolvedValue([row]);
      const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict });
      vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as never);

      const result = await repo.upsert('user-1', 'api-1', 'enc:key');
      expect(result.isVerified).toBe(true);
      expect(result.verifiedAt).toBe(String(verifiedAt));
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────
  describe('delete()', () => {
    it('userId와 apiId로 API 키를 삭제한다', async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.delete).mockReturnValue({ where: mockWhere } as never);

      await repo.delete('user-1', 'api-1');
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
    });

    it('DB 에러를 그대로 던진다', async () => {
      vi.mocked(mockDb.delete).mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('삭제 실패')),
      } as never);

      await expect(repo.delete('user-1', 'api-1')).rejects.toThrow('삭제 실패');
    });
  });

  // ─── findByUserAndApi ──────────────────────────────────────────────────────
  describe('findByUserAndApi()', () => {
    it('userId와 apiId가 일치하는 키를 반환한다', async () => {
      const row = makeApiKeyRow();
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([row]),
          }),
        }),
      } as never);

      const result = await repo.findByUserAndApi('user-1', 'api-1');
      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user-1');
      expect(result!.apiId).toBe('api-1');
    });

    it('존재하지 않으면 null을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await repo.findByUserAndApi('user-1', 'api-999');
      expect(result).toBeNull();
    });
  });

  // ─── findAllByUser ─────────────────────────────────────────────────────────
  describe('findAllByUser()', () => {
    it('사용자의 모든 API 키를 반환한다', async () => {
      const rows = [
        makeApiKeyRow({ id: 'key-1', api_id: 'api-1' }),
        makeApiKeyRow({ id: 'key-2', api_id: 'api-2' }),
      ];
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(rows),
        }),
      } as never);

      const result = await repo.findAllByUser('user-1');
      expect(result).toHaveLength(2);
      expect(result[0].apiId).toBe('api-1');
      expect(result[1].apiId).toBe('api-2');
    });

    it('API 키가 없으면 빈 배열을 반환한다', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const result = await repo.findAllByUser('user-no-keys');
      expect(result).toEqual([]);
    });
  });

  // ─── updateVerificationStatus ──────────────────────────────────────────────
  describe('updateVerificationStatus()', () => {
    it('인증 상태를 true로 업데이트한다', async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(mockDb.update).mockReturnValue({ set: mockSet } as never);

      await repo.updateVerificationStatus('user-1', 'api-1', true);

      expect(mockDb.update).toHaveBeenCalled();
      const setArg = mockSet.mock.calls[0][0];
      expect(setArg.is_verified).toBe(true);
      expect(setArg.verified_at).toBeInstanceOf(Date);
      expect(setArg.updated_at).toBeInstanceOf(Date);
    });

    it('인증 상태를 false로 업데이트하면 verified_at이 null이 된다', async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(mockDb.update).mockReturnValue({ set: mockSet } as never);

      await repo.updateVerificationStatus('user-1', 'api-1', false);

      const setArg = mockSet.mock.calls[0][0];
      expect(setArg.is_verified).toBe(false);
      expect(setArg.verified_at).toBeNull();
    });

    it('DB 에러를 그대로 던진다', async () => {
      vi.mocked(mockDb.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error('업데이트 실패')),
        }),
      } as never);

      await expect(repo.updateVerificationStatus('user-1', 'api-1', true)).rejects.toThrow(
        '업데이트 실패'
      );
    });
  });
});
