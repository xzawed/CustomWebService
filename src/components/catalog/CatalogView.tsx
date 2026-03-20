'use client';

import { useState, useMemo } from 'react';
import type { ApiCatalogItem, Category } from '@/types/api';
import { CategoryTabs } from './CategoryTabs';
import { ApiCard } from './ApiCard';
import { Search } from 'lucide-react';

interface CatalogViewProps {
  initialApis: ApiCatalogItem[];
  categories: Category[];
  selectionMode?: boolean;
  selectedIds?: string[];
  onSelect?: (api: ApiCatalogItem) => void;
  onDeselect?: (id: string) => void;
  onDetail?: (api: ApiCatalogItem) => void;
}

export function CatalogView({
  initialApis,
  categories,
  selectionMode = false,
  selectedIds = [],
  onSelect,
  onDeselect,
  onDetail,
}: CatalogViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const filteredApis = useMemo(() => {
    let result = initialApis;

    if (activeCategory !== 'all') {
      result = result.filter((api) => api.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (api) =>
          api.name.toLowerCase().includes(query) ||
          api.description.toLowerCase().includes(query) ||
          api.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return result;
  }, [initialApis, activeCategory, searchQuery]);

  const handleSelect = (api: ApiCatalogItem) => {
    if (!selectionMode) return;
    if (selectedIds.includes(api.id)) {
      onDeselect?.(api.id);
    } else {
      onSelect?.(api);
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="API 이름, 설명, 태그로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <CategoryTabs
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      {filteredApis.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-gray-500">검색 결과가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredApis.map((api) => (
            <ApiCard
              key={api.id}
              api={api}
              isSelected={selectedIds.includes(api.id)}
              onSelect={() => handleSelect(api)}
              onDetail={() => onDetail?.(api)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
