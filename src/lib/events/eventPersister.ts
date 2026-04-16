import { eventBus } from './eventBus';
import { createEventRepository } from '@/repositories/factory';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

let registered = false;

/**
 * 서버 시작 시 1회 호출 — 모든 DomainEvent를 platform_events 테이블에 자동 기록.
 * 중복 등록 방지를 위해 모듈 수준 플래그 사용.
 */
export function registerEventPersister(): void {
  if (registered) return;
  registered = true;

  eventBus.on(async (event) => {
    try {
      const supabase = await createServiceClient();
      const eventRepo = createEventRepository(supabase);
      await eventRepo.persist(event, {});
    } catch (err) {
      logger.warn('EventPersister: failed to persist event', {
        type: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
