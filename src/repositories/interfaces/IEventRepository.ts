import type { DomainEvent } from '@/types/events';

export interface PersistEventContext {
  userId?: string;
  projectId?: string;
  correlationId?: string;
}

export interface EventRecord {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
}

export interface IEventRepository {
  persist(event: DomainEvent, context: PersistEventContext): Promise<void>;
  persistAsync(event: DomainEvent, context: PersistEventContext): void;
  findByUser(userId: string, limit?: number): Promise<EventRecord[]>;
}
