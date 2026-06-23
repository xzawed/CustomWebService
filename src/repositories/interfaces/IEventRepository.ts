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
  /** 지정 type 이벤트 중 `since`(포함) 이후 개수 — QC 통계 등 집계용. DB 오류 시 throw. */
  countByTypeSince(type: string, since: Date): Promise<number>;
  /** 지정 type 이벤트 중 `since`(포함) 이후 payload 배열 — 집계용. DB 오류 시 throw. */
  findPayloadsByTypeSince(type: string, since: Date): Promise<unknown[]>;
}
