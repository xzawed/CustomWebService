// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import TemplateSelector from './TemplateSelector';

describe('TemplateSelector', () => {
  it('11개 템플릿 버튼이 렌더링된다', () => {
    renderComponent(<TemplateSelector onSelect={vi.fn()} />);
    // 각 템플릿은 버튼으로 렌더링됨
    expect(screen.getAllByRole('button').length).toBe(11);
  });

  it('"대시보드" 템플릿 버튼이 렌더링된다', () => {
    renderComponent(<TemplateSelector onSelect={vi.fn()} />);
    expect(screen.getByText('대시보드')).toBeTruthy();
  });

  it('템플릿 버튼 클릭 시 onSelect가 Template 객체와 함께 호출된다', () => {
    const onSelect = vi.fn();
    renderComponent(<TemplateSelector onSelect={onSelect} />);
    fireEvent.click(screen.getByText('대시보드'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dashboard', label: '대시보드' }),
    );
  });

  it('aiSuggestedId가 일치하는 템플릿에 "★ AI" 뱃지가 표시된다', () => {
    renderComponent(<TemplateSelector onSelect={vi.fn()} aiSuggestedId="dashboard" />);
    expect(screen.getByText('★ AI')).toBeTruthy();
  });

  it('aiSuggestedId가 없으면 "★ AI" 뱃지가 없다', () => {
    renderComponent(<TemplateSelector onSelect={vi.fn()} />);
    expect(screen.queryByText('★ AI')).toBeNull();
  });

  it('isLoadingAi=true일 때 AI 추천 준비 중 메시지가 표시된다', () => {
    renderComponent(<TemplateSelector onSelect={vi.fn()} isLoadingAi={true} />);
    expect(screen.getByText(/AI 추천 준비 중/)).toBeTruthy();
  });
});
