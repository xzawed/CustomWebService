// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RePromptSection } from './RePromptSection';

const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

/**
 * 목이 통지할 버전. 테스트에서 바꿔 **미상(undefined)** 경로까지 덮는다.
 * `RePromptPanel`은 서버가 version을 안 주면 `undefined`를 그대로 흘린다
 * (`?? 1`은 "미상"을 **가장 오래된 1번**으로 바꾸는 잘못된 기본값이라 제거됐다).
 */
let nextVersion: number | undefined = 3;

vi.mock('@/components/builder/RePromptPanel', () => ({
  default: ({
    projectId,
    onRegenerationComplete,
  }: {
    projectId: string;
    onRegenerationComplete: (version: number | undefined) => void;
  }) => (
    <button
      data-testid="reprompt-panel"
      data-project-id={projectId}
      onClick={() => onRegenerationComplete(nextVersion)}
    >
      trigger
    </button>
  ),
}));

describe('RePromptSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextVersion = 3;
  });

  it('초기 버전 번호를 헤더에 표시한다', () => {
    render(<RePromptSection projectId="proj-1" currentVersion={1} />);
    expect(screen.getByText(/현재 v1/)).toBeTruthy();
  });

  it('RePromptPanel에 projectId를 전달한다', () => {
    render(<RePromptSection projectId="proj-1" currentVersion={1} />);
    expect(screen.getByTestId('reprompt-panel').getAttribute('data-project-id')).toBe('proj-1');
  });

  it('onRegenerationComplete 호출 시 router.refresh()가 실행된다', async () => {
    render(<RePromptSection projectId="proj-1" currentVersion={1} />);
    await act(async () => {
      screen.getByTestId('reprompt-panel').click();
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('onRegenerationComplete 호출 시 헤더 버전이 업데이트된다', async () => {
    render(<RePromptSection projectId="proj-1" currentVersion={1} />);
    await act(async () => {
      screen.getByTestId('reprompt-panel').click();
    });
    expect(screen.getByText(/현재 v3/)).toBeTruthy();
  });

  // 서버가 version을 안 준 경우(미상). "현재 v{N}"은 사람이 읽는 라벨이라
  // 빈 값이나 잘못된 숫자를 보이느니 **직전 값을 유지**하는 편이 낫고,
  // 실제 최신값은 `router.refresh()`가 서버에서 다시 가져온다.
  it('version이 undefined면 헤더 값을 유지하고 refresh만 한다', async () => {
    nextVersion = undefined;
    render(<RePromptSection projectId="proj-1" currentVersion={2} />);

    await act(async () => {
      screen.getByTestId('reprompt-panel').click();
    });

    // 직전 값 유지 — "현재 v" 뒤가 비거나 NaN이 되지 않는다
    expect(screen.getByText(/현재 v2/)).toBeTruthy();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
