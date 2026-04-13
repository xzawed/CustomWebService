import type { DomainEvent } from '@/types/events';

class EventBus {
  // pub/sub 구독자 제거됨 — emit은 하위 호환을 위해 유지
  emit(_event: DomainEvent): void {}
}

export const eventBus = new EventBus();
