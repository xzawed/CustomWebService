// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import BuilderModeToggle from './BuilderModeToggle';

describe('BuilderModeToggle', () => {
  it('mode="api-first"일 때 "API 직접 선택" 텍스트가 표시된다', () => {
    renderComponent(<BuilderModeToggle mode="api-first" onReset={vi.fn()} />);
    expect(screen.getByText('API 직접 선택')).toBeTruthy();
  });

  it('mode="context-first"일 때 "아이디어로 시작" 텍스트가 표시된다', () => {
    renderComponent(<BuilderModeToggle mode="context-first" onReset={vi.fn()} />);
    expect(screen.getByText('아이디어로 시작')).toBeTruthy();
  });

  it('"방식 변경" 버튼이 렌더링된다', () => {
    renderComponent(<BuilderModeToggle mode="api-first" onReset={vi.fn()} />);
    expect(screen.getByRole('button', { name: '방식 변경' })).toBeTruthy();
  });

  it('"방식 변경" 버튼 클릭 시 onReset이 호출된다', () => {
    const onReset = vi.fn();
    renderComponent(<BuilderModeToggle mode="api-first" onReset={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: '방식 변경' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('disabled=true일 때 버튼이 비활성화된다', () => {
    renderComponent(<BuilderModeToggle mode="api-first" onReset={vi.fn()} disabled={true} />);
    expect(screen.getByRole('button', { name: '방식 변경' }).hasAttribute('disabled')).toBe(true);
  });
});
