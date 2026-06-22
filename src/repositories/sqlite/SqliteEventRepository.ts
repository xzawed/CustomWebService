import { eq, desc } from 'drizzle-orm';
import type { SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import type { DomainEvent } from '@/types/events';
import { logger } from '@/lib/utils/logger';
import type { IEventRepository, PersistEventContext, EventRecord } from '@/repositories/interfaces';

/**
 * SQLite(better-sqlite3 + drizzle)-based EventRepository for persisting domain events.
 *
 * Same semantics as the Supabase version (the source of truth for mapping):
 * - persist() logs but doesn't throw on error (best-effort audit logging — the
 *   main business operation must not fail because of event persistence).
 * - persistAsync() is fire-and-forget; it never throws.
 * - findByUser() returns the most recent events for a user (max 100), with
 *   `payload` already deserialized by drizzle (mode:'json') and `createdAt`
 *   as an ISO string (SQLite stores timestamps as ISO8601 text).
 *
 * Single-user / self-hosted path: ownership is enforced by the supplied user_id
 * filter (no RLS layer).
 */
export class SqliteEventRepository implements IEventRepository {
  constructor(private readonly db: SqliteDb) {}

  /**
   * Persists a domain event to the platform_events table.
   * Extracts user_id / project_id from the event payload when not provided
   * in context, so callers only need to pass context for cross-cutting fields.
   */
  async persist(event: DomainEvent, context: PersistEventContext = {}): Promise<void> {
    const payload = event.payload as Record<string, unknown>;

    const row = {
      type: event.type,
      payload,
      user_id: context.userId ?? (payload.userId as string | undefined) ?? null,
      project_id: context.projectId ?? (payload.projectId as string | undefined) ?? null,
    };

    try {
      this.db.insert(schema.platformEvents).values(row).run();
    } catch (err: unknown) {
      // Log but don't throw — event persistence is best-effort.
      logger.warn('Failed to persist domain event', {
        eventType: event.type,
        error: err instanceof Error ? err.message : String(err),
        correlationId: context.correlationId,
      });
    }
  }

  /**
   * Fire-and-forget wrapper — safe to call without await.
   * Errors are swallowed after logging; the caller's execution continues.
   */
  persistAsync(event: DomainEvent, context: PersistEventContext = {}): void {
    this.persist(event, context).catch((err: unknown) => {
      logger.warn('EventRepository.persistAsync unhandled error', {
        eventType: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  /**
   * Retrieves recent events for a user (for audit log UI, max 100),
   * newest first.
   */
  async findByUser(userId: string, limit = 50): Promise<EventRecord[]> {
    const safeLimit = Math.min(limit, 100);

    try {
      const rows = this.db
        .select({
          id: schema.platformEvents.id,
          type: schema.platformEvents.type,
          payload: schema.platformEvents.payload,
          created_at: schema.platformEvents.created_at,
        })
        .from(schema.platformEvents)
        .where(eq(schema.platformEvents.user_id, userId))
        .orderBy(desc(schema.platformEvents.created_at))
        .limit(safeLimit)
        .all();

      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        payload: row.payload,
        createdAt: String(row.created_at),
      }));
    } catch (err: unknown) {
      logger.warn('Failed to fetch user events', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }
}
