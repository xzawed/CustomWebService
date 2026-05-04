import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { on: vi.fn() },
}));
vi.mock('./slackAlert', () => ({
  sendSlackAlert: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.ERROR_RATE_ALERT_THRESHOLD;
});

type EventHandler = (event: { type: string; payload: unknown }) => Promise<void>;

describe('registerErrorRateMonitor', () => {
  it('eventBus.on에 핸들러를 1회 등록한다', async () => {
    const { registerErrorRateMonitor } = await import('./errorRateMonitor');
    const { eventBus } = await import('@/lib/events/eventBus');

    registerErrorRateMonitor();

    expect(eventBus.on).toHaveBeenCalledTimes(1);
  });

  it('중복 호출해도 핸들러를 1번만 등록한다', async () => {
    const { registerErrorRateMonitor } = await import('./errorRateMonitor');
    const { eventBus } = await import('@/lib/events/eventBus');

    registerErrorRateMonitor();
    registerErrorRateMonitor();

    expect(eventBus.on).toHaveBeenCalledTimes(1);
  });

  it('임계값 미달 시 sendSlackAlert를 호출하지 않는다', async () => {
    const { registerErrorRateMonitor } = await import('./errorRateMonitor');
    const { eventBus } = await import('@/lib/events/eventBus');
    const { sendSlackAlert } = await import('./slackAlert');

    registerErrorRateMonitor();
    const handler = (eventBus.on as ReturnType<typeof vi.fn>).mock.calls[0][0] as EventHandler;

    for (let i = 0; i < 4; i++) {
      await handler({ type: 'CODE_GENERATION_FAILED', payload: {} });
    }

    expect(sendSlackAlert).not.toHaveBeenCalled();
  });

  it('임계값(5회) 도달 시 sendSlackAlert를 호출한다', async () => {
    const { registerErrorRateMonitor } = await import('./errorRateMonitor');
    const { eventBus } = await import('@/lib/events/eventBus');
    const { sendSlackAlert } = await import('./slackAlert');
    (sendSlackAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    registerErrorRateMonitor();
    const handler = (eventBus.on as ReturnType<typeof vi.fn>).mock.calls[0][0] as EventHandler;

    for (let i = 0; i < 5; i++) {
      await handler({ type: 'CODE_GENERATION_FAILED', payload: { error: 'AI 오류', provider: 'claude' } });
    }

    expect(sendSlackAlert).toHaveBeenCalledTimes(1);
    expect((sendSlackAlert as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      level: 'error',
      title: '코드 생성 실패율 임계값 초과',
    });
  });

  it('같은 윈도우 내 중복 알림을 보내지 않는다', async () => {
    const { registerErrorRateMonitor } = await import('./errorRateMonitor');
    const { eventBus } = await import('@/lib/events/eventBus');
    const { sendSlackAlert } = await import('./slackAlert');
    (sendSlackAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    registerErrorRateMonitor();
    const handler = (eventBus.on as ReturnType<typeof vi.fn>).mock.calls[0][0] as EventHandler;

    for (let i = 0; i < 10; i++) {
      await handler({ type: 'CODE_GENERATION_FAILED', payload: {} });
    }

    expect(sendSlackAlert).toHaveBeenCalledTimes(1);
  });

  it('CODE_GENERATION_FAILED 외 이벤트는 무시한다', async () => {
    const { registerErrorRateMonitor } = await import('./errorRateMonitor');
    const { eventBus } = await import('@/lib/events/eventBus');
    const { sendSlackAlert } = await import('./slackAlert');

    registerErrorRateMonitor();
    const handler = (eventBus.on as ReturnType<typeof vi.fn>).mock.calls[0][0] as EventHandler;

    for (let i = 0; i < 10; i++) {
      await handler({ type: 'SERVICE_CREATED', payload: {} });
    }

    expect(sendSlackAlert).not.toHaveBeenCalled();
  });

  it('5분 윈도우 만료 후 카운트가 초기화된다', async () => {
    vi.useFakeTimers();
    const { registerErrorRateMonitor } = await import('./errorRateMonitor');
    const { eventBus } = await import('@/lib/events/eventBus');
    const { sendSlackAlert } = await import('./slackAlert');
    (sendSlackAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    registerErrorRateMonitor();
    const handler = (eventBus.on as ReturnType<typeof vi.fn>).mock.calls[0][0] as EventHandler;

    // Trigger 5 failures to hit the threshold and alert
    for (let i = 0; i < 5; i++) {
      await handler({ type: 'CODE_GENERATION_FAILED', payload: {} });
    }
    expect(sendSlackAlert).toHaveBeenCalledTimes(1);

    // Advance time past the 5-minute window
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    // Trigger a new failure — window should reset (lines 25-27), then count starts fresh
    await handler({ type: 'CODE_GENERATION_FAILED', payload: {} });

    // Only 1 failure in the new window — should NOT trigger another alert
    expect(sendSlackAlert).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
