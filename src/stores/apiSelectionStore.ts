import { create } from 'zustand';
import type { ApiCatalogItem } from '@/types/api';
import { LIMITS } from '@/lib/config/features';

interface ApiSelectionState {
  selectedApis: ApiCatalogItem[];
  searchQuery: string;
  activeCategory: string;

  addApi: (api: ApiCatalogItem) => void;
  removeApi: (id: string) => void;
  clearApis: () => void;
  setSearchQuery: (query: string) => void;
  setActiveCategory: (category: string) => void;
  isSelected: (id: string) => boolean;
  canAddMore: () => boolean;
}

export const useApiSelectionStore = create<ApiSelectionState>((set, get) => ({
  selectedApis: [],
  searchQuery: '',
  activeCategory: 'all',

  addApi: (api) => {
    const state = get();
    if (state.selectedApis.length >= LIMITS.maxApisPerProject) return;
    if (state.selectedApis.some((a) => a.id === api.id)) return;
    set({ selectedApis: [...state.selectedApis, api] });
  },

  removeApi: (id) => {
    set((state) => ({
      selectedApis: state.selectedApis.filter((a) => a.id !== id),
    }));
  },

  clearApis: () => set({ selectedApis: [] }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setActiveCategory: (activeCategory) => set({ activeCategory }),

  isSelected: (id) => get().selectedApis.some((a) => a.id === id),
  canAddMore: () => get().selectedApis.length < LIMITS.maxApisPerProject,
}));
