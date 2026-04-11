import { eq, desc, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import type { DomainEvent } from '@/types/events';
import { logger } from '@/lib/utils/logger';
import type { IEventRepository, PersistEventContext, EventRecord } from '@/repositories/interfaces';

type DrizzleDb = NodePgDatabase<typeof schema>;

/**
 * Drizzle-based EventRepository for persisting domain events.
 *
 * Same semantics as the Supabase version:
 * - persist() logs but doesn't throw on error (best-effort)
 * - persistAsync() is fire-and-forget
 */
export class DrizzleEventRepository implements IEventRepository {
  constructor(private readonly db: DrizzleDb) {}

  async persist(event: DomainEvent, context: PersistEventContext = {}): Promise<void> {
    const payload = event.payload as Record<string, unknown>;

    const row = {
      type: event.type,
      payload: payload,
      user_id: context.userId ?? (payload.userId as string | undefined) ?? null,
      project_id: context.projectId ?? (payload.projectId as string | undefined) ?? null,
    };

    try {
      await this.db.insert(schema.platformEvents).values(row);
    } catch (err: unknown) {
      logger.warn('Failed to persist domain event', {
        eventType: event.type,
        error: err instanceof Error ? err.message : String(err),
        correlationId: context.correlationId,
      });
    }
  }

  persistAsync(event: DomainEvent, context: PersistEventContext = {}): void {
    this.persist(event, context).catch((err: unknown) => {
      logger.warn('EventRepository.persistAsync unhandled error', {
        eventType: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  async findByUser(userId: string, limit = 50): Promise<EventRecord[]> {
    const safeLimit = Math.min(limit, 100);

    try {
      const rows = await this.db
        .select({
          id: schema.platformEvents.id,
          type: schema.platformEvents.type,
          payload: schema.platformEvents.payload,
          created_at: schema.platformEvents.created_at,
        })
        .from(schema.platformEvents)
        .where(eq(schema.platformEvents.user_id, userId))
        .orderBy(desc(schema.platformEvents.created_at))
        .limit(safeLimit);

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
