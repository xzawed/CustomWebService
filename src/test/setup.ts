import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';

// onUnhandledRequest:'error' — MSW가 가로채는 미처리 요청을 즉시 실패시켜, 향후 자동 fetch
// 컴포넌트 테스트가 무성히 hang(혹은 실제 네트워크 누출)으로 빠지는 것을 예방한다.
// 현재 모든 테스트는 stub/직접 호출이라 MSW 미처리 요청을 내지 않으며, 정상 경로(Anthropic,
// /api/v1/preview, /api/v1/generate/status)는 handlers.ts가 커버한다.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
