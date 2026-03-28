'use client';

import type { Category } from '@/types/api';

interface CategoryTabsProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

export function CategoryTabs({ categories, activeCategory, onCategoryChange }: CategoryTabsProps) {
  const totalCount = categories.reduce((sum, cat) => sum + cat.count, 0);

  return (
    <div className="overflow-x-auto scrollbar-hide">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onCategoryChange('all')}
          className="shrink-0 rounded-lg px-4 py-2 text-xs font-semibold transition-all"
          style={
            activeCategory === 'all'
              ? { background: 'var(--accent-light)', color: 'var(--accent-primary)', border: '1px solid var(--border-accent)' }
              : { color: 'var(--text-secondary)', border: '1px solid transparent' }
          }
        >
          전체 ({totalCount})
        </button>

        {categories.map((category) => (
          <button
            key={category.key}
            type="button"
            onClick={() => onCategoryChange(category.key)}
            className="shrink-0 rounded-lg px-4 py-2 text-xs font-semibold transition-all"
            style={
              activeCategory === category.key
                ? { background: 'var(--accent-light)', color: 'var(--accent-primary)', border: '1px solid var(--border-accent)' }
                : { color: 'var(--text-secondary)', border: '1px solid transparent' }
            }
          >
            {category.label} ({category.count})
          </button>
        ))}
      </div>
    </div>
  );
}
