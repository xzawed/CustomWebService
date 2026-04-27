// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import ContextSuggestions from './ContextSuggestions';

describe('ContextSuggestions', () => {
  it('로딩 중일 때 animate-pulse skeleton 3개가 렌더링된다', () => {
    renderComponent(
      <ContextSuggestions
        suggestions={[]}
        isLoading={true}
        activeIndex={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(document.querySelectorAll('.animate-pulse').length).toBe(3);
  });

  it('로딩 중일 때 "다시 생성" 버튼이 없다', () => {
    renderComponent(
      <ContextSuggestions
        suggestions={[]}
        isLoading={true}
        activeIndex={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.queryByText('다시 생성')).toBeNull();
  });

  it('suggestions 항목이 렌더링된다', () => {
    renderComponent(
      <ContextSuggestions
        suggestions={['날씨 정보를 보여주는 앱', '금융 데이터 시각화']}
        isLoading={false}
        activeIndex={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('날씨 정보를 보여주는 앱')).toBeTruthy();
    expect(screen.getByText('금융 데이터 시각화')).toBeTruthy();
  });

  it('추천 항목 클릭 시 onSelect가 (suggestion, index)와 함께 호출된다', () => {
    const onSelect = vi.fn();
    renderComponent(
      <ContextSuggestions
        suggestions={['날씨 정보를 보여주는 앱', '두 번째 추천']}
        isLoading={false}
        activeIndex={null}
        onSelect={onSelect}
        onRefresh={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('날씨 정보를 보여주는 앱'));
    expect(onSelect).toHaveBeenCalledWith('날씨 정보를 보여주는 앱', 0);
  });

  it('suggestions가 빈 배열일 때 "다시 시도" 버튼이 표시된다', () => {
    renderComponent(
      <ContextSuggestions
        suggestions={[]}
        isLoading={false}
        activeIndex={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('다시 시도')).toBeTruthy();
  });

  it('"다시 시도" 클릭 시 onRefresh가 호출된다', () => {
    const onRefresh = vi.fn();
    renderComponent(
      <ContextSuggestions
        suggestions={[]}
        isLoading={false}
        activeIndex={null}
        onSelect={vi.fn()}
        onRefresh={onRefresh}
      />,
    );
    fireEvent.click(screen.getByText('다시 시도'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('"추천 N" 라벨이 각 항목에 표시된다', () => {
    renderComponent(
      <ContextSuggestions
        suggestions={['첫 번째', '두 번째']}
        isLoading={false}
        activeIndex={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('추천 1')).toBeTruthy();
    expect(screen.getByText('추천 2')).toBeTruthy();
  });
});
