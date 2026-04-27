// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { ApiSearchBar } from './ApiSearchBar';

describe('ApiSearchBar', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('기본 placeholder가 표시된다', () => {
    renderComponent(<ApiSearchBar value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('API 이름, 설명으로 검색...')).toBeTruthy();
  });

  it('커스텀 placeholder가 적용된다', () => {
    renderComponent(<ApiSearchBar value="" onChange={vi.fn()} placeholder="검색..." />);
    expect(screen.getByPlaceholderText('검색...')).toBeTruthy();
  });

  it('입력 직후 onChange가 호출되지 않는다 (debounce)', () => {
    const onChange = vi.fn();
    renderComponent(<ApiSearchBar value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('300ms 후 onChange가 입력값과 함께 호출된다', () => {
    const onChange = vi.fn();
    renderComponent(<ApiSearchBar value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledWith('test');
  });

  it('299ms에는 onChange가 호출되지 않는다', () => {
    const onChange = vi.fn();
    renderComponent(<ApiSearchBar value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
    vi.advanceTimersByTime(299);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('값이 없을 때 clear 버튼이 없다', () => {
    renderComponent(<ApiSearchBar value="" onChange={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('값이 있을 때 clear 버튼이 표시된다', () => {
    renderComponent(<ApiSearchBar value="" onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('clear 버튼 클릭 시 onChange("")가 즉시 호출된다', () => {
    const onChange = vi.fn();
    renderComponent(<ApiSearchBar value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});
