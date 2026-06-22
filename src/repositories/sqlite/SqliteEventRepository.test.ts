import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createSqliteConnection, runSqliteMigrations, type SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import type { DomainEvent } from '@/types/events';
import { SqliteEventRepository } from './SqliteEventRepository';

// Silence + observe best-effort logging.
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '@/lib/utils/logger';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';
const PROJECT_ID = '33333333-3333-3333-3333-333333333333';

function seedUser(db: SqliteDb, id: string, email: string): void {
  db.insert(schema.users).values({ id, email }).run();
}

function seedProject(db: SqliteDb, id: string, userId: string): void {
  db.insert(schema.projects).values({ id, user_id: userId, name: 'Test Project' }).run();
}

/** Direct row read helper (bypasses the repo) for white-box assertions. */
function allEvents(db: SqliteDb) {
  return db.select().from(schema.platformEvents).all();
}

describe('SqliteEventRepository', () => {
  let db: SqliteDb;
  let raw: Database.Database;
  let repo: SqliteEventRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    runSqliteMigrations(db);
    // FK prerequisites: a user (and one project) so user_id/project_id FKs resolve.
    seedUser(db, USER_ID, 'owner@example.com');
    seedUser(db, OTHER_USER_ID, 'other@example.com');
    seedProject(db, PROJECT_ID, USER_ID);
    repo = new SqliteEventRepository(db);
  });

  afterEach(() => {
    raw.close();
  });

  describe('persist', () => {
    it('persists an event with type and payload', async () => {
      const event: DomainEvent = {
        type: 'PROJECT_CREATED',
        payload: { projectId: PROJECT_ID, userId: USER_ID, apiCount: 3 },
      };

      await repo.persist(event, { userId: USER_ID, projectId: PROJECT_ID });

      const rows = allEvents(db);
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe('PROJECT_CREATED');
      // payload (mode:'json') is round-tripped as an object, no JSON.parse needed.
      expect(rows[0].payload).toEqual({
        projectId: PROJECT_ID,
        userId: USER_ID,
        apiCount: 3,
      });
      expect(rows[0].user_id).toBe(USER_ID);
      expect(rows[0].project_id).toBe(PROJECT_ID);
      expect(typeof rows[0].id).toBe('string');
      expect(rows[0].id.length).toBeGreaterThan(0);
      // created_at is auto-filled by the schema $defaultFn as an ISO string.
      expect(typeof rows[0].created_at).toBe('string');
      expect(() => new Date(rows[0].created_at as string).toISOString()).not.toThrow();
    });

    it('extracts user_id and project_id from the payload when not given in context', async () => {
      const event: DomainEvent = {
        type: 'PROJECT_CREATED',
        payload: { projectId: PROJECT_ID, userId: USER_ID, apiCount: 1 },
      };

      // No context fields supplied -> falls back to payload.userId / payload.projectId.
      await repo.persist(event, {});

      const rows = allEvents(db);
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(USER_ID);
      expect(rows[0].project_id).toBe(PROJECT_ID);
    });

    it('prefers context over payload-derived ids', async () => {
      const event: DomainEvent = {
        type: 'PROJECT_CREATED',
        payload: { projectId: PROJECT_ID, userId: OTHER_USER_ID, apiCount: 0 },
      };

      await repo.persist(event, { userId: USER_ID, projectId: PROJECT_ID });

      const rows = allEvents(db);
      expect(rows[0].user_id).toBe(USER_ID); // context wins over payload OTHER_USER_ID
      expect(rows[0].project_id).toBe(PROJECT_ID);
    });

    it('stores null user_id / project_id when neither context nor payload provide them', async () => {
      const event: DomainEvent = {
        type: 'API_QUOTA_WARNING',
        payload: { service: 'unsplash', usage: 90, limit: 100 },
      };

      await repo.persist(event, {});

      const rows = allEvents(db);
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBeNull();
      expect(rows[0].project_id).toBeNull();
      expect(rows[0].payload).toEqual({ service: 'unsplash', usage: 90, limit: 100 });
    });

    it('defaults context to {} when omitted', async () => {
      const event: DomainEvent = {
        type: 'USER_SIGNED_UP',
        payload: { userId: USER_ID },
      };

      // Called with only the event argument — context defaults to {}.
      await repo.persist(event);

      const rows = allEvents(db);
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(USER_ID);
      expect(rows[0].project_id).toBeNull();
    });

    it('is best-effort: logs a warning and does not throw on DB error (FK violation)', async () => {
      const event: DomainEvent = {
        type: 'USER_SIGNED_UP',
        // userId references a non-existent user -> FK constraint failure.
        payload: { userId: '99999999-9999-9999-9999-999999999999' },
      };

      await expect(repo.persist(event, {})).resolves.toBeUndefined();

      expect(allEvents(db)).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to persist domain event',
        expect.objectContaining({ eventType: 'USER_SIGNED_UP' }),
      );
    });

    it('forwards correlationId into the warning context on failure', async () => {
      const event: DomainEvent = {
        type: 'USER_SIGNED_UP',
        payload: { userId: '99999999-9999-9999-9999-999999999999' },
      };

      await repo.persist(event, { correlationId: 'corr-123' });

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to persist domain event',
        expect.objectContaining({ correlationId: 'corr-123' }),
      );
    });
  });

  describe('persistAsync', () => {
    it('writes the event without requiring await (fire-and-forget)', async () => {
      const event: DomainEvent = {
        type: 'DEPLOYMENT_COMPLETED',
        payload: { projectId: PROJECT_ID, url: 'https://x.xzawed.xyz', platform: 'railway' },
      };

      repo.persistAsync(event, { userId: USER_ID, projectId: PROJECT_ID });

      // Allow the internal promise microtask to settle.
      await Promise.resolve();
      await Promise.resolve();

      const rows = allEvents(db);
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe('DEPLOYMENT_COMPLETED');
      expect(rows[0].project_id).toBe(PROJECT_ID);
    });

    it('returns void synchronously', () => {
      const event: DomainEvent = {
        type: 'USER_SIGNED_UP',
        payload: { userId: USER_ID },
      };
      const result = repo.persistAsync(event, {});
      expect(result).toBeUndefined();
    });

    it('does not throw even when persistence fails', async () => {
      const event: DomainEvent = {
        type: 'USER_SIGNED_UP',
        payload: { userId: '99999999-9999-9999-9999-999999999999' },
      };

      expect(() => repo.persistAsync(event, {})).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();

      expect(allEvents(db)).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('findByUser', () => {
    it('returns recent events for a user, newest first, with the EventRecord shape', async () => {
      // Insert with explicit, ordered created_at so ordering is deterministic.
      const base = Date.parse('2026-06-01T00:00:00.000Z');
      const mk = (i: number) => new Date(base + i * 1000).toISOString();

      db.insert(schema.platformEvents)
        .values([
          { type: 'EVENT_A', payload: { n: 1 }, user_id: USER_ID, created_at: mk(0) },
          { type: 'EVENT_B', payload: { n: 2 }, user_id: USER_ID, created_at: mk(1) },
          { type: 'EVENT_C', payload: { n: 3 }, user_id: USER_ID, created_at: mk(2) },
        ])
        .run();

      const result = await repo.findByUser(USER_ID);

      expect(result).toHaveLength(3);
      // newest first
      expect(result.map((r) => r.type)).toEqual(['EVENT_C', 'EVENT_B', 'EVENT_A']);
      const first = result[0];
      expect(first).toEqual({
        id: expect.any(String),
        type: 'EVENT_C',
        payload: { n: 3 },
        createdAt: mk(2),
      });
      // createdAt mapped as a string
      expect(typeof first.createdAt).toBe('string');
    });

    it('only returns events for the requested user', async () => {
      db.insert(schema.platformEvents)
        .values([
          { type: 'MINE', payload: {}, user_id: USER_ID },
          { type: 'THEIRS', payload: {}, user_id: OTHER_USER_ID },
        ])
        .run();

      const result = await repo.findByUser(USER_ID);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('MINE');
    });

    it('returns an empty array when the user has no events', async () => {
      const result = await repo.findByUser(USER_ID);
      expect(result).toEqual([]);
    });

    it('respects the limit argument', async () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({
        type: `E_${i}`,
        payload: { i },
        user_id: USER_ID,
        created_at: new Date(Date.parse('2026-06-01T00:00:00.000Z') + i * 1000).toISOString(),
      }));
      db.insert(schema.platformEvents).values(rows).run();

      const result = await repo.findByUser(USER_ID, 2);
      expect(result).toHaveLength(2);
      // Most recent two (E_4, E_3)
      expect(result.map((r) => r.type)).toEqual(['E_4', 'E_3']);
    });

    it('caps the limit at 100', async () => {
      // 3 rows but limit 1000 -> capped at 100, returns all 3.
      db.insert(schema.platformEvents)
        .values([
          { type: 'A', payload: {}, user_id: USER_ID },
          { type: 'B', payload: {}, user_id: USER_ID },
          { type: 'C', payload: {}, user_id: USER_ID },
        ])
        .run();

      const result = await repo.findByUser(USER_ID, 1000);
      expect(result).toHaveLength(3);
    });

    it('defaults to a limit of 50 when not provided', async () => {
      // 51 events; default limit 50 -> only 50 returned.
      const baseTs = Date.parse('2026-06-01T00:00:00.000Z');
      const rows = Array.from({ length: 51 }, (_, i) => ({
        type: `E_${i}`,
        payload: { i },
        user_id: USER_ID,
        created_at: new Date(baseTs + i * 1000).toISOString(),
      }));
      db.insert(schema.platformEvents).values(rows).run();

      const result = await repo.findByUser(USER_ID);
      expect(result).toHaveLength(50);
    });

    it('returns an empty array (not a throw) when the query fails', async () => {
      // Close the underlying DB to force the select to throw, then assert graceful handling.
      raw.close();

      const result = await repo.findByUser(USER_ID);
      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to fetch user events',
        expect.objectContaining({ userId: USER_ID }),
      );

      // Re-open a connection so afterEach's close() does not throw on an already-closed handle.
      const conn = createSqliteConnection(':memory:');
      raw = conn.raw;
    });
  });
});
