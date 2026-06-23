import { eventBus } from './eventBus';
import { createEventRepository } from '@/repositories/factory';
import { createServiceClient } from '@/lib/supabase/server';
import { getDbProvider } from '@/lib/config/providers';
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
      // provider-무관: supabase 모드에서만 service client를 생성하고, sqlite/postgres는
      // 인자 없이 레포를 만든다(factory가 DB_PROVIDER로 분기). sqlite 모드에서 createServiceClient를
      // 호출하면 supabase env 부재로 throw하던 버그를 제거한다.
      const supabase = getDbProvider() === 'supabase' ? await createServiceClient() : undefined;
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
