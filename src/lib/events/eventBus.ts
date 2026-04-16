import type { DomainEvent } from '@/types/events';
import { logger } from '@/lib/utils/logger';

type EventHandler = (event: DomainEvent) => void | Promise<void>;

class EventBus {
  private handlers: EventHandler[] = [];

  on(handler: EventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  emit(event: DomainEvent): void {
    for (const handler of this.handlers) {
      Promise.resolve(handler(event)).catch((err) => {
        logger.warn('EventBus handler error', { type: event.type, error: err });
      });
    }
  }
}

export const eventBus = new EventBus();
