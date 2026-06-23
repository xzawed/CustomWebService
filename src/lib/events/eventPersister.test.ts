import { describe, it, expect, vi, beforeEach } from 'vitest';

// All mocks are declared at the top level, but because we use vi.resetModules()
// in beforeEach we re-import everything dynamically inside each test.

vi.mock('./eventBus', () => ({
  eventBus: { on: vi.fn(), emit: vi.fn() },
}));
vi.mock('@/repositories/factory', () => ({
  createEventRepository: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('registerEventPersister', () => {
  it('registers a handler on eventBus.on once', async () => {
    const { registerEventPersister } = await import('./eventPersister');
    const { eventBus } = await import('./eventBus');

    registerEventPersister();

    expect(eventBus.on).toHaveBeenCalledTimes(1);
    expect(typeof (eventBus.on as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('function');
  });

  it('is idempotent — calling twice only registers one handler', async () => {
    const { registerEventPersister } = await import('./eventPersister');
    const { eventBus } = await import('./eventBus');

    registerEventPersister();
    registerEventPersister();

    expect(eventBus.on).toHaveBeenCalledTimes(1);
  });

  it('handler calls createEventRepository (zero-arg) and eventRepo.persist when invoked', async () => {
    const { registerEventPersister } = await import('./eventPersister');
    const { eventBus } = await import('./eventBus');
    const { createEventRepository } = await import('@/repositories/factory');

    const mockPersist = vi.fn().mockResolvedValue(undefined);
    const mockEventRepo = { persist: mockPersist };

    (createEventRepository as ReturnType<typeof vi.fn>).mockReturnValue(mockEventRepo);

    registerEventPersister();

    const handler = (eventBus.on as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
      event: unknown,
    ) => Promise<void>;

    const fakeEvent = { type: 'TEST_EVENT', payload: { data: 'value' } };
    await handler(fakeEvent);

    expect(createEventRepository).toHaveBeenCalledTimes(1);
    expect(createEventRepository).toHaveBeenCalledWith();
    expect(mockPersist).toHaveBeenCalledWith(fakeEvent, {});
  });

  it('logs a warning and does not throw when persist rejects', async () => {
    const { registerEventPersister } = await import('./eventPersister');
    const { eventBus } = await import('./eventBus');
    const { createEventRepository } = await import('@/repositories/factory');
    const { logger } = await import('@/lib/utils/logger');

    const mockPersist = vi.fn().mockRejectedValue(new Error('DB unavailable'));
    (createEventRepository as ReturnType<typeof vi.fn>).mockReturnValue({ persist: mockPersist });

    registerEventPersister();

    const handler = (eventBus.on as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
      event: unknown,
    ) => Promise<void>;

    const fakeEvent = { type: 'FAIL_EVENT', payload: {} };

    // Should not throw
    await expect(handler(fakeEvent)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      'EventPersister: failed to persist event',
      expect.objectContaining({ type: 'FAIL_EVENT', error: 'DB unavailable' }),
    );
  });

  it('logs a warning and does not throw when createEventRepository throws', async () => {
    const { registerEventPersister } = await import('./eventPersister');
    const { eventBus } = await import('./eventBus');
    const { createEventRepository } = await import('@/repositories/factory');
    const { logger } = await import('@/lib/utils/logger');

    (createEventRepository as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('factory failure');
    });

    registerEventPersister();

    const handler = (eventBus.on as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
      event: unknown,
    ) => Promise<void>;

    const fakeEvent = { type: 'FACTORY_FAIL_EVENT', payload: {} };

    await expect(handler(fakeEvent)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      'EventPersister: failed to persist event',
      expect.objectContaining({ type: 'FACTORY_FAIL_EVENT', error: 'factory failure' }),
    );
  });

  it('logs a warning with stringified error for non-Error rejections', async () => {
    const { registerEventPersister } = await import('./eventPersister');
    const { eventBus } = await import('./eventBus');
    const { createEventRepository } = await import('@/repositories/factory');
    const { logger } = await import('@/lib/utils/logger');

    const mockPersist = vi.fn().mockRejectedValue('plain string error');
    (createEventRepository as ReturnType<typeof vi.fn>).mockReturnValue({ persist: mockPersist });

    registerEventPersister();

    const handler = (eventBus.on as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
      event: unknown,
    ) => Promise<void>;

    const fakeEvent = { type: 'STRING_ERR_EVENT', payload: {} };
    await handler(fakeEvent);

    expect(logger.warn).toHaveBeenCalledWith(
      'EventPersister: failed to persist event',
      expect.objectContaining({ error: 'plain string error' }),
    );
  });
});
