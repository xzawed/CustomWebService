'use client';

import type { Category } from '@/types/api';

interface CategoryTabsProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

export function CategoryTabs({
  categories,
  activeCategory,
  onCategoryChange,
}: CategoryTabsProps) {
  const totalCount = categories.reduce((sum, cat) => sum + cat.count, 0);

  return (
    <div className="overflow-x-auto scrollbar-hide">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onCategoryChange('all')}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            activeCategory === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          전체 ({totalCount})
        </button>

        {categories.map((category) => (
          <button
            key={category.key}
            type="button"
            onClick={() => onCategoryChange(category.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeCategory === category.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {category.label} ({category.count})
          </button>
        ))}
      </div>
    </div>
  );
}
