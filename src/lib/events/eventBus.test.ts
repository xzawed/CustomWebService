import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// eventBus는 모듈 레벨 싱글톤이므로 각 테스트에서 on/off로 핸들러를 직접 관리
import { eventBus } from './eventBus';
import type { DomainEvent } from '@/types/events';

const TEST_EVENT: DomainEvent = {
  type: 'USER_SIGNED_UP',
  payload: { userId: 'user-1' },
};

describe('EventBus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── on / emit ─────────────────────────────────────────────────────────────
  describe('on() + emit()', () => {
    it('등록된 핸들러가 emit 시 호출된다', async () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on(handler);

      eventBus.emit(TEST_EVENT);
      await new Promise((r) => setTimeout(r, 0));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(TEST_EVENT);

      unsubscribe();
    });

    it('여러 핸들러가 모두 호출된다', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      const unsub1 = eventBus.on(handler1);
      const unsub2 = eventBus.on(handler2);
      const unsub3 = eventBus.on(handler3);

      eventBus.emit(TEST_EVENT);
      await new Promise((r) => setTimeout(r, 0));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);

      unsub1();
      unsub2();
      unsub3();
    });

    it('이벤트 페이로드가 핸들러에 그대로 전달된다', async () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on(handler);

      const event: DomainEvent = {
        type: 'PROJECT_CREATED',
        payload: { projectId: 'proj-1', userId: 'user-1', apiCount: 3 },
      };
      eventBus.emit(event);
      await new Promise((r) => setTimeout(r, 0));

      expect(handler).toHaveBeenCalledWith(event);
      unsubscribe();
    });
  });

  // ─── unsubscribe ───────────────────────────────────────────────────────────
  describe('unsubscribe()', () => {
    it('unsubscribe 후 emit해도 핸들러가 호출되지 않는다', async () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on(handler);

      unsubscribe();
      eventBus.emit(TEST_EVENT);
      await new Promise((r) => setTimeout(r, 0));

      expect(handler).not.toHaveBeenCalled();
    });

    it('일부 핸들러만 unsubscribe하면 나머지는 계속 호출된다', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsub1 = eventBus.on(handler1);
      const unsub2 = eventBus.on(handler2);

      unsub1(); // handler1만 제거

      eventBus.emit(TEST_EVENT);
      await new Promise((r) => setTimeout(r, 0));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);

      unsub2();
    });

    it('동일 핸들러를 두 번 unsubscribe해도 에러가 없다', async () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on(handler);

      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();

      eventBus.emit(TEST_EVENT);
      await new Promise((r) => setTimeout(r, 0));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─── 에러 처리 ─────────────────────────────────────────────────────────────
  describe('에러 처리', () => {
    it('핸들러 에러가 발생해도 다른 핸들러는 호출된다', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('핸들러 에러'));
      const normalHandler = vi.fn();

      const unsub1 = eventBus.on(errorHandler);
      const unsub2 = eventBus.on(normalHandler);

      eventBus.emit(TEST_EVENT);
      await new Promise((r) => setTimeout(r, 10)); // Promise.resolve().catch 처리 대기

      expect(normalHandler).toHaveBeenCalledTimes(1);

      unsub1();
      unsub2();
    });

    it('핸들러 에러 시 logger.warn이 호출된다', async () => {
      const { logger } = await import('@/lib/utils/logger');
      const errorHandler = vi.fn().mockRejectedValue(new Error('핸들러 에러'));

      const unsubscribe = eventBus.on(errorHandler);

      eventBus.emit(TEST_EVENT);
      await new Promise((r) => setTimeout(r, 10));

      expect(logger.warn).toHaveBeenCalledWith(
        'EventBus handler error',
        expect.objectContaining({ type: 'USER_SIGNED_UP' })
      );

      unsubscribe();
    });

    // ⚠️ **비동기 거부와 동기 throw 는 다른 경로다.**
    // `Promise.resolve(handler(event))` 는 `handler(event)` 를 **먼저 평가**하므로,
    // 핸들러가 동기적으로 던지면 `.catch` 가 붙기 전에 예외가 나간다.
    // 그러면 emit 호출부 — 계정 삭제·생성 파이프라인·카탈로그 활성화 — 가 통째로 실패한다.
    // 이벤트는 감사·부가 기록이지 본 작업의 성공 조건이 아니므로 **절대 전파되면 안 된다.**
    // (2026-08-07 실측으로 전파를 확인하고 `try` 로 막았다.)
    it('동기적으로 throw 하는 핸들러가 emit 호출부를 깨뜨리지 않는다', async () => {
      const { logger } = await import('@/lib/utils/logger');
      const syncThrower = vi.fn(() => {
        throw new Error('동기 throw');
      });
      const normalHandler = vi.fn();

      const unsub1 = eventBus.on(syncThrower);
      const unsub2 = eventBus.on(normalHandler);

      // 호출부가 깨지지 않는다 — 이게 핵심 단언이다
      expect(() => eventBus.emit(TEST_EVENT)).not.toThrow();
      await new Promise((r) => setTimeout(r, 10));

      // 그리고 뒤 핸들러도 계속 호출된다
      expect(normalHandler).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'EventBus handler threw synchronously',
        expect.objectContaining({ type: 'USER_SIGNED_UP' }),
      );

      unsub1();
      unsub2();
    });

    it('async 에러 핸들러가 여러 개여도 모두 logger.warn을 호출한다', async () => {
      const { logger } = await import('@/lib/utils/logger');
      const errorHandler1 = vi.fn().mockRejectedValue(new Error('에러1'));
      const errorHandler2 = vi.fn().mockRejectedValue(new Error('에러2'));

      const unsub1 = eventBus.on(errorHandler1);
      const unsub2 = eventBus.on(errorHandler2);

      eventBus.emit(TEST_EVENT);
      await new Promise((r) => setTimeout(r, 10));

      expect(logger.warn).toHaveBeenCalledTimes(2);

      unsub1();
      unsub2();
    });
  });

  // ─── async 핸들러 ──────────────────────────────────────────────────────────
  describe('async 핸들러', () => {
    it('async 핸들러가 올바르게 호출된다', async () => {
      const results: string[] = [];
      const asyncHandler = vi.fn().mockImplementation(async (event: DomainEvent) => {
        await new Promise((r) => setTimeout(r, 5));
        results.push(event.type);
      });

      const unsubscribe = eventBus.on(asyncHandler);

      eventBus.emit(TEST_EVENT);
      await new Promise((r) => setTimeout(r, 20));

      expect(asyncHandler).toHaveBeenCalledTimes(1);
      expect(results).toContain('USER_SIGNED_UP');

      unsubscribe();
    });

    it('여러 async 핸들러가 모두 호출된다', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      const unsub1 = eventBus.on(handler1);
      const unsub2 = eventBus.on(handler2);

      eventBus.emit(TEST_EVENT);
      await new Promise((r) => setTimeout(r, 10));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      unsub1();
      unsub2();
    });
  });
});
