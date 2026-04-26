// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RePromptSection } from './RePromptSection';

const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('@/components/builder/RePromptPanel', () => ({
  default: ({
    projectId,
    onRegenerationComplete,
  }: {
    projectId: string;
    onRegenerationComplete: (version: number) => void;
  }) => (
    <button
      data-testid="reprompt-panel"
      data-project-id={projectId}
      onClick={() => onRegenerationComplete(3)}
    >
      trigger
    </button>
  ),
}));

describe('RePromptSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
