import type { DomainEvent, DomainEventType } from '@/types/events';

type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => void;

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  emit(event: DomainEvent): void {
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`Event handler error for ${event.type}:`, error);
        }
      }
    }

    // Wildcard handlers
    const allHandlers = this.handlers.get('*');
    if (allHandlers) {
      for (const handler of allHandlers) {
        try {
          handler(event);
        } catch (error) {
          console.error('Wildcard event handler error:', error);
        }
      }
    }
  }

  on<T extends DomainEventType>(
    type: T,
    handler: EventHandler<Extract<DomainEvent, { type: T }>>
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as EventHandler);

    // Return unsubscribe function
    return () => this.off(type, handler as EventHandler);
  }

  onAll(handler: EventHandler): () => void {
    if (!this.handlers.has('*')) {
      this.handlers.set('*', new Set());
    }
    this.handlers.get('*')!.add(handler);
    return () => this.off('*' as DomainEventType, handler);
  }

  off(type: DomainEventType | '*', handler: EventHandler): void {
    this.handlers.get(type as string)?.delete(handler);
  }
}

export const eventBus = new EventBus();
