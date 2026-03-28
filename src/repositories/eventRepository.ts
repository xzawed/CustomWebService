import type { SupabaseClient } from '@supabase/supabase-js';
import type { DomainEvent } from '@/types/events';
import { logger } from '@/lib/utils/logger';

export interface PersistEventContext {
  /** Authenticated user who triggered this event */
  userId?: string;
  /** Primary project involved in this event */
  projectId?: string;
  /** Optional request correlation ID for cross-log tracing */
  correlationId?: string;
}

/**
 * EventRepository persists domain events to the platform_events table.
 *
 * Design decisions:
 * - Uses the SERVICE ROLE client to bypass RLS (events must always be writable
 *   regardless of the current user context).
 * - This repository should be called alongside eventBus.emit(), not instead of it.
 *   The in-memory bus still handles synchronous local handlers.
 * - persistAsync() is the recommended call site — it never throws, so callers
 *   don't need try/catch boilerplate.
 */
export class EventRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Persists a domain event to the database.
   * Extracts user_id / project_id from the event payload when not provided
   * in context, so callers only need to pass context for cross-cutting fields.
   */
  async persist(event: DomainEvent, context: PersistEventContext = {}): Promise<void> {
    const payload = event.payload as Record<string, unknown>;

    const row = {
      type: event.type,
      payload: payload,
      user_id: context.userId ?? (payload.userId as string | undefined) ?? null,
      project_id: context.projectId ?? (payload.projectId as string | undefined) ?? null,
    };

    const { error } = await this.supabase.from('platform_events').insert(row);

    if (error) {
      // Log but don't throw — event persistence is best-effort.
      // The main business operation should not fail because of audit logging.
      logger.warn('Failed to persist domain event', {
        eventType: event.type,
        error: error.message,
        code: error.code,
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
   * Retrieves recent events for a user (for audit log UI, max 100).
   */
  async findByUser(
    userId: string,
    limit = 50
  ): Promise<Array<{ id: string; type: string; payload: unknown; createdAt: string }>> {
    const { data, error } = await this.supabase
      .from('platform_events')
      .select('id, type, payload, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 100));

    if (error) {
      logger.warn('Failed to fetch user events', { userId, error: error.message });
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.id as string,
      type: row.type as string,
      payload: row.payload,
      createdAt: row.created_at as string,
    }));
  }
}
