// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import ContextInput from './ContextInput';

describe('ContextInput', () => {
  it('현재 값과 placeholder를 표시한다', () => {
    renderComponent(<ContextInput value="안녕" onChange={vi.fn()} />);
    const ta = screen.getByPlaceholderText(
      '만들고 싶은 서비스를 자유롭게 설명해주세요...',
    ) as HTMLTextAreaElement;
    expect(ta.value).toBe('안녕');
  });

  it('입력 시 onChange가 호출된다', () => {
    const onChange = vi.fn();
    renderComponent(<ContextInput value="" onChange={onChange} />);
    const ta = screen.getByPlaceholderText(/서비스를 자유롭게/);
    fireEvent.change(ta, { target: { value: '날씨 서비스' } });
    expect(onChange).toHaveBeenCalledWith('날씨 서비스');
  });

  it('charCount/maxLength를 우측 하단에 표시한다', () => {
    renderComponent(
      <ContextInput value="hello" onChange={vi.fn()} minLength={5} maxLength={100} />,
    );
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText(/\/100/)).toBeTruthy();
  });

  it('charCount < minLength이고 0이 아닐 때 경고 메시지를 표시한다', () => {
    renderComponent(
      <ContextInput value="hi" onChange={vi.fn()} minLength={10} maxLength={100} />,
    );
    expect(screen.getByText(/최소 10자 이상 입력해주세요/)).toBeTruthy();
    expect(screen.getByText(/현재 2자/)).toBeTruthy();
  });

  it('charCount = 0일 때 경고 메시지를 표시하지 않는다', () => {
    renderComponent(<ContextInput value="" onChange={vi.fn()} minLength={10} maxLength={100} />);
    expect(screen.queryByText(/최소 10자 이상/)).toBeNull();
  });

  it('charCount >= minLength일 때 경고 메시지를 표시하지 않는다', () => {
    renderComponent(
      <ContextInput value="0123456789ab" onChange={vi.fn()} minLength={10} maxLength={100} />,
    );
    expect(screen.queryByText(/최소 10자 이상/)).toBeNull();
  });

  it('count 색상: minLength 미만은 빨간색', () => {
    renderComponent(
      <ContextInput value="ab" onChange={vi.fn()} minLength={10} maxLength={100} />,
    );
    const span = screen.getByText('2');
    expect(span.className).toContain('text-red-500');
  });

  it('count 색상: maxLength-200 초과면 노란색', () => {
    const value = 'a'.repeat(50);
    renderComponent(
      <ContextInput value={value} onChange={vi.fn()} minLength={5} maxLength={200} />,
    );
    const span = screen.getByText('50');
    expect(span.className).toContain('text-yellow-500');
  });

  it('count 색상: 정상 범위는 초록색', () => {
    const value = 'a'.repeat(50);
    renderComponent(
      <ContextInput value={value} onChange={vi.fn()} minLength={10} maxLength={500} />,
    );
    const span = screen.getByText('50');
    expect(span.className).toContain('text-green-600');
  });
});
