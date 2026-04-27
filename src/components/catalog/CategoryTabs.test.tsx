// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { CategoryTabs } from './CategoryTabs';
import type { Category } from '@/types/api';

const categories: Category[] = [
  { key: 'weather', label: '날씨', icon: '🌤', count: 5 },
  { key: 'finance', label: '금융', icon: '💰', count: 3 },
];

describe('CategoryTabs', () => {
  it('"전체 (0)" 버튼이 빈 categories에서도 렌더링된다', () => {
    renderComponent(
      <CategoryTabs categories={[]} activeCategory="all" onCategoryChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '전체 (0)' })).toBeTruthy();
  });

  it('categories count 합계가 "전체" 버튼에 표시된다', () => {
    renderComponent(
      <CategoryTabs categories={categories} activeCategory="all" onCategoryChange={vi.fn()} />,
    );
    // totalCount = 5 + 3 = 8
    expect(screen.getByRole('button', { name: '전체 (8)' })).toBeTruthy();
  });

  it('각 카테고리 버튼이 라벨과 count와 함께 렌더링된다', () => {
    renderComponent(
      <CategoryTabs categories={categories} activeCategory="all" onCategoryChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '날씨 (5)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '금융 (3)' })).toBeTruthy();
  });

  it('카테고리 버튼 클릭 시 onCategoryChange가 category.key와 함께 호출된다', () => {
    const onCategoryChange = vi.fn();
    renderComponent(
      <CategoryTabs categories={categories} activeCategory="all" onCategoryChange={onCategoryChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '날씨 (5)' }));
    expect(onCategoryChange).toHaveBeenCalledWith('weather');
  });

  it('"전체" 버튼 클릭 시 onCategoryChange("all")이 호출된다', () => {
    const onCategoryChange = vi.fn();
    renderComponent(
      <CategoryTabs categories={categories} activeCategory="weather" onCategoryChange={onCategoryChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '전체 (8)' }));
    expect(onCategoryChange).toHaveBeenCalledWith('all');
  });
});
