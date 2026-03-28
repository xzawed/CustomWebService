import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BuilderMode = 'api-first' | 'context-first';

interface BuilderModeState {
  mode: BuilderMode;
  setMode: (mode: BuilderMode) => void;
}

export const useBuilderModeStore = create<BuilderModeState>()(
  persist(
    (set) => ({
      mode: 'api-first',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'builder-mode',
      partialize: (state) => ({ mode: state.mode }),
    }
  )
);
