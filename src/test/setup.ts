import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import { server } from './mocks/server';

/**
 * MSW 미처리 요청 탐지 (E7).
 *
 * `onUnhandledRequest: 'error'` **하나만으로는 미처리 요청 부재를 보증하지 못한다.**
 * MSW가 만들어 내는 실패는 결국 그 요청을 낸 쪽으로 전파되는데, 앱 코드가 `.catch()`로
 * 삼키거나 fire-and-forget으로 띄운 요청이면 아무도 관측하지 않는다. 그러면
 * **테스트는 초록인데 실제로는 미처리 요청이 나간** 상태가 된다 (MSW #946 / #943).
 * "전체 통과 = 미처리 요청 부재"가 성립하지 않던 이유다.
 *
 * 그래서 콜백으로 직접 기록해 두고 매 테스트 종료 시 **테스트 자체를 실패**시킨다.
 * 앱 코드가 무엇을 삼키든 이 단언은 우회되지 않는다.
 *
 * 새 fetch 엔드포인트를 추가했다면 `src/test/mocks/handlers.ts`에 핸들러를 넣을 것.
 */
const unhandledRequests: string[] = [];

beforeAll(() =>
  server.listen({
    onUnhandledRequest(request, print) {
      unhandledRequests.push(`${request.method} ${request.url}`);
      // 기존 동작(요청을 실패시키는 것)은 그대로 둔다 — 조기 신호로 여전히 유용하다.
      print.error();
    },
  }),
);

afterEach(() => {
  server.resetHandlers();

  // splice로 비우면서 꺼낸다 — 남겨 두면 다음 테스트가 남의 실패를 뒤집어쓴다.
  const seen = unhandledRequests.splice(0, unhandledRequests.length);
  expect(
    seen,
    `MSW 미처리 요청이 발생했다. src/test/mocks/handlers.ts에 핸들러를 추가할 것:\n${seen.join('\n')}`,
  ).toEqual([]);
});

afterAll(() => server.close());
