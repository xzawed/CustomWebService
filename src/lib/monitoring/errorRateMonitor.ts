import { eventBus } from '@/lib/events/eventBus';
import { sendSlackAlert } from './slackAlert';
import { logger } from '@/lib/utils/logger';

// 5분 윈도우 내 생성 실패 횟수 추적 (인메모리, Railway 단일 인스턴스 전제)
const WINDOW_MS = 5 * 60 * 1000;
const ALERT_THRESHOLD = Number(process.env.ERROR_RATE_ALERT_THRESHOLD ?? 5);

interface FailureWindow {
  count: number;
  windowStart: number;
  alerted: boolean;
}

const state: FailureWindow = {
  count: 0,
  windowStart: Date.now(),
  alerted: false,
};

let monitorRegistered = false;

function resetWindowIfExpired(): void {
  if (Date.now() - state.windowStart > WINDOW_MS) {
    state.count = 0;
    state.windowStart = Date.now();
    state.alerted = false;
  }
}

/**
 * 서버 시작 시 1회 호출.
 * CODE_GENERATION_FAILED 이벤트를 구독하여 5분 윈도우 내 임계값 초과 시 Slack 알림.
 */
export function registerErrorRateMonitor(): void {
  if (monitorRegistered) return;
  monitorRegistered = true;

  eventBus.on(async (event) => {
    if (event.type !== 'CODE_GENERATION_FAILED') return;

    resetWindowIfExpired();
    state.count++;

    logger.info('Error rate monitor', {
      count: state.count,
      threshold: ALERT_THRESHOLD,
      windowStart: new Date(state.windowStart).toISOString(),
    });

    if (state.count >= ALERT_THRESHOLD && !state.alerted) {
      state.alerted = true;
      const payload = event.payload as { projectId?: string; error?: string; provider?: string };
      await sendSlackAlert({
        level: 'error',
        title: '코드 생성 실패율 임계값 초과',
        message: `5분 내 ${state.count}회 실패가 감지되었습니다. 서비스 상태를 확인하세요.`,
        fields: {
          '5분 내 실패 횟수': state.count,
          '임계값': ALERT_THRESHOLD,
          'Provider': payload.provider ?? 'unknown',
          '마지막 에러': payload.error?.slice(0, 100) ?? '-',
        },
      });
    }
  });
}
