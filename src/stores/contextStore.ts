import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LIMITS } from '@/lib/config/features';

interface ContextState {
  context: string;
  selectedTemplate: string | null;

  setContext: (context: string) => void;
  setTemplate: (templateId: string | null) => void;
  isValid: () => boolean;
  charCount: () => number;
  reset: () => void;
}

export const useContextStore = create<ContextState>()(
  persist(
    (set, get) => ({
      context: '',
      selectedTemplate: null,

      setContext: (context) => {
        if (context.length <= LIMITS.contextMaxLength) {
          set({ context });
        }
      },

      setTemplate: (selectedTemplate) => set({ selectedTemplate }),

      isValid: () => {
        const { context } = get();
        return context.length >= LIMITS.contextMinLength && context.length <= LIMITS.contextMaxLength;
      },

      charCount: () => get().context.length,

      reset: () => set({ context: '', selectedTemplate: null }),
    }),
    {
      name: 'builder-context',
      partialize: (state) => ({ context: state.context, selectedTemplate: state.selectedTemplate }),
    }
  )
);
