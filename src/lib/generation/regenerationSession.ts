/**
 * 재생성(regenerate) 전용 세션 AbortController 싱글톤.
 *
 * ⚠️ **빌더 create→generate 세션(`generationSession`)과 공유하지 말 것.**
 * 대시보드/RePromptPanel 재생성이 빌더 세션을 abort 하면, 빌더 쪽 폴링이 terminal
 * 콜백 없이 조용히 종료되고 generationStore 가 `generating` 에 영원히 고착된다.
 * 세션 abort 는 네트워크만 끊고 스토어 전이를 보장하지 않는다. 통일하지 말 것.
 *
 * - `beginRegenerationSession`: 직전 재생성 세션을 abort 한 뒤 새 컨트롤러를 연다.
 * - `abortRegenerationSession`: 현재 재생성 세션을 abort 하고 비운다 (예: 패널 언마운트).
 * - 실행 단위 상태 오염 방지는 패널 로컬 runId/terminal 가드가 1차 방어다.
 *   이 모듈은 네트워크 취소를 담당하는 2차 방어다.
 */

let currentController: AbortController | null = null;

/** 직전 재생성 세션을 끊고 새 세션 signal 을 반환한다. */
export function beginRegenerationSession(): AbortSignal {
  if (currentController) {
    currentController.abort();
  }
  currentController = new AbortController();
  return currentController.signal;
}

/** 현재 재생성 세션을 abort 하고 비운다. 이미 없으면 no-op. */
export function abortRegenerationSession(): void {
  if (currentController) {
    currentController.abort();
    currentController = null;
  }
}

/**
 * 테스트 격리용. 모듈 싱글톤을 초기화한다.
 * 프로덕션 코드에서 호출하지 말 것.
 */
export function __resetRegenerationSessionForTests(): void {
  if (currentController) {
    currentController.abort();
    currentController = null;
  }
}
