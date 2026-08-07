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

  /**
   * **핸들러 실패가 호출부를 절대 깨뜨리지 않는다.** 이벤트는 감사·부가 기록이지
   * 본 작업의 성공 조건이 아니다 — 계정 삭제·생성 파이프라인·카탈로그 활성화가 전부
   * 이걸 부르고, 여기서 예외가 새면 **그 도메인 작업 자체가 실패**한다.
   *
   * ⚠️ `try` 가 필요한 이유: `Promise.resolve(handler(event))` 는 `handler(event)` 를
   * **먼저 평가**하므로, 핸들러가 **동기적으로 throw** 하면 `.catch` 가 붙기 전에 예외가
   * 나가 버린다. 즉 `.catch` 만으로는 **비동기 거부만** 막힌다.
   * (2026-08-07 실측으로 확인 — 문서는 "emit이 핸들러를 .catch로 감싼다"고만 적고 있었다.
   *  현행 핸들러는 전부 `async` 라 사고는 없었지만, 비-async 핸들러 하나면 깨진다.)
   */
  emit(event: DomainEvent): void {
    for (const handler of this.handlers) {
      try {
        Promise.resolve(handler(event)).catch((err) => {
          logger.warn('EventBus handler error', { type: event.type, error: err });
        });
      } catch (err) {
        logger.warn('EventBus handler threw synchronously', { type: event.type, error: err });
      }
    }
  }
}

export const eventBus = new EventBus();
