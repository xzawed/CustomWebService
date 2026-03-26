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
          className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
            activeCategory === 'all'
              ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-400 ring-1 ring-cyan-500/30'
              : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
          }`}
        >
          전체 ({totalCount})
        </button>

        {categories.map((category) => (
          <button
            key={category.key}
            type="button"
            onClick={() => onCategoryChange(category.key)}
            className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
              activeCategory === category.key
                ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-400 ring-1 ring-cyan-500/30'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
            }`}
          >
            {category.label} ({category.count})
          </button>
        ))}
      </div>
    </div>
  );
}
