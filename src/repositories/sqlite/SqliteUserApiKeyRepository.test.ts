import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createSqliteConnection, runSqliteMigrations } from '@/lib/db/sqlite/connection';
import type { SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import { SqliteUserApiKeyRepository } from './SqliteUserApiKeyRepository';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';
const API_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const API_ID_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('SqliteUserApiKeyRepository', () => {
  let db: SqliteDb;
  let raw: Database.Database;
  let repo: SqliteUserApiKeyRepository;

  beforeEach(() => {
    ({ db, raw } = createSqliteConnection(':memory:'));
    runSqliteMigrations(db);

    // FK 선행 행 시드: users(2) + api_catalog(2)
    db.insert(schema.users)
      .values([
        { id: USER_ID, email: 'owner@example.com' },
        { id: OTHER_USER_ID, email: 'other@example.com' },
      ])
      .run();
    db.insert(schema.apiCatalog)
      .values([
        { id: API_ID, name: 'API One' },
        { id: API_ID_2, name: 'API Two' },
      ])
      .run();

    repo = new SqliteUserApiKeyRepository(db);
  });

  afterEach(() => {
    raw.close();
  });

  describe('upsert', () => {
    it('새 키를 삽입하고 도메인 shape를 반환한다', async () => {
      const result = await repo.upsert(USER_ID, API_ID, 'enc-key-1');

      expect(result.id).toBeTruthy();
      expect(result.userId).toBe(USER_ID);
      expect(result.apiId).toBe(API_ID);
      expect(result.encryptedKey).toBe('enc-key-1');
      expect(result.isVerified).toBe(false);
      expect(result.verifiedAt).toBeNull();
      expect(typeof result.createdAt).toBe('string');
      expect(typeof result.updatedAt).toBe('string');
      // ISO 문자열인지 확인
      expect(Number.isNaN(Date.parse(result.createdAt))).toBe(false);
    });

    it('동일 (user_id, api_id)에 대해 encrypted_key를 갱신한다 (중복 행 미생성)', async () => {
      const first = await repo.upsert(USER_ID, API_ID, 'enc-key-1');
      const second = await repo.upsert(USER_ID, API_ID, 'enc-key-2');

      // 같은 행이 갱신됨 (동일 PK)
      expect(second.id).toBe(first.id);
      expect(second.encryptedKey).toBe('enc-key-2');

      const all = await repo.findAllByUser(USER_ID);
      expect(all).toHaveLength(1);
      expect(all[0].encryptedKey).toBe('enc-key-2');
    });

    it('서로 다른 (user, api) 조합은 별도 행으로 저장한다', async () => {
      await repo.upsert(USER_ID, API_ID, 'k1');
      await repo.upsert(USER_ID, API_ID_2, 'k2');
      await repo.upsert(OTHER_USER_ID, API_ID, 'k3');

      expect(await repo.findAllByUser(USER_ID)).toHaveLength(2);
      expect(await repo.findAllByUser(OTHER_USER_ID)).toHaveLength(1);
    });
  });

  describe('findByUserAndApi', () => {
    it('존재하는 키를 반환한다', async () => {
      await repo.upsert(USER_ID, API_ID, 'enc-key-1');

      const found = await repo.findByUserAndApi(USER_ID, API_ID);
      expect(found).not.toBeNull();
      expect(found?.encryptedKey).toBe('enc-key-1');
      expect(found?.userId).toBe(USER_ID);
      expect(found?.apiId).toBe(API_ID);
    });

    it('존재하지 않으면 null을 반환한다', async () => {
      const found = await repo.findByUserAndApi(USER_ID, API_ID);
      expect(found).toBeNull();
    });

    it('다른 사용자의 키는 조회하지 않는다 (소유권 필터)', async () => {
      await repo.upsert(OTHER_USER_ID, API_ID, 'k3');

      const found = await repo.findByUserAndApi(USER_ID, API_ID);
      expect(found).toBeNull();
    });
  });

  describe('findAllByUser', () => {
    it('사용자의 모든 키를 반환한다', async () => {
      await repo.upsert(USER_ID, API_ID, 'k1');
      await repo.upsert(USER_ID, API_ID_2, 'k2');

      const all = await repo.findAllByUser(USER_ID);
      expect(all).toHaveLength(2);
      const apiIds = all.map((k) => k.apiId).sort();
      expect(apiIds).toEqual([API_ID, API_ID_2].sort());
    });

    it('키가 없으면 빈 배열을 반환한다', async () => {
      const all = await repo.findAllByUser(USER_ID);
      expect(all).toEqual([]);
    });

    it('다른 사용자의 키는 포함하지 않는다', async () => {
      await repo.upsert(USER_ID, API_ID, 'k1');
      await repo.upsert(OTHER_USER_ID, API_ID_2, 'k2');

      const all = await repo.findAllByUser(USER_ID);
      expect(all).toHaveLength(1);
      expect(all[0].apiId).toBe(API_ID);
    });
  });

  describe('updateVerificationStatus', () => {
    it('isVerified=true 설정 시 verified_at을 채운다', async () => {
      await repo.upsert(USER_ID, API_ID, 'k1');

      await repo.updateVerificationStatus(USER_ID, API_ID, true);

      const found = await repo.findByUserAndApi(USER_ID, API_ID);
      expect(found?.isVerified).toBe(true);
      expect(found?.verifiedAt).not.toBeNull();
      expect(Number.isNaN(Date.parse(found!.verifiedAt as string))).toBe(false);
    });

    it('isVerified=false 설정 시 verified_at을 null로 비운다', async () => {
      await repo.upsert(USER_ID, API_ID, 'k1');
      await repo.updateVerificationStatus(USER_ID, API_ID, true);

      await repo.updateVerificationStatus(USER_ID, API_ID, false);

      const found = await repo.findByUserAndApi(USER_ID, API_ID);
      expect(found?.isVerified).toBe(false);
      expect(found?.verifiedAt).toBeNull();
    });

    it('존재하지 않는 (user, api)에 대해 에러 없이 no-op 처리한다', async () => {
      await expect(
        repo.updateVerificationStatus(USER_ID, API_ID, true),
      ).resolves.toBeUndefined();
      expect(await repo.findByUserAndApi(USER_ID, API_ID)).toBeNull();
    });
  });

  describe('delete', () => {
    it('존재하는 키를 삭제한다', async () => {
      await repo.upsert(USER_ID, API_ID, 'k1');

      await repo.delete(USER_ID, API_ID);

      expect(await repo.findByUserAndApi(USER_ID, API_ID)).toBeNull();
      expect(await repo.findAllByUser(USER_ID)).toEqual([]);
    });

    it('해당 (user, api)만 삭제하고 다른 행은 보존한다', async () => {
      await repo.upsert(USER_ID, API_ID, 'k1');
      await repo.upsert(USER_ID, API_ID_2, 'k2');

      await repo.delete(USER_ID, API_ID);

      const all = await repo.findAllByUser(USER_ID);
      expect(all).toHaveLength(1);
      expect(all[0].apiId).toBe(API_ID_2);
    });

    it('존재하지 않는 키 삭제는 에러 없이 처리한다', async () => {
      await expect(repo.delete(USER_ID, API_ID)).resolves.toBeUndefined();
    });
  });
});
