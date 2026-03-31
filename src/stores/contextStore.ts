import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LIMITS } from '@/lib/config/features';
import type { DesignMood, DesignAudience, DesignLayout, DesignPreferences } from '@/types/project';

interface ContextState {
  context: string;
  selectedTemplate: string | null;
  mood: DesignMood;
  audience: DesignAudience;
  layoutPreference: DesignLayout;

  setContext: (context: string) => void;
  setTemplate: (templateId: string | null) => void;
  setMood: (mood: DesignMood) => void;
  setAudience: (audience: DesignAudience) => void;
  setLayoutPreference: (layout: DesignLayout) => void;
  getDesignPreferences: () => DesignPreferences;
  isValid: () => boolean;
  charCount: () => number;
  reset: () => void;
}

export const useContextStore = create<ContextState>()(
  persist(
    (set, get) => ({
      context: '',
      selectedTemplate: null,
      mood: 'auto' as DesignMood,
      audience: 'general' as DesignAudience,
      layoutPreference: 'auto' as DesignLayout,

      setContext: (context) => {
        if (context.length <= LIMITS.contextMaxLength) {
          set({ context });
        }
      },

      setTemplate: (selectedTemplate) => set({ selectedTemplate }),
      setMood: (mood) => set({ mood }),
      setAudience: (audience) => set({ audience }),
      setLayoutPreference: (layoutPreference) => set({ layoutPreference }),

      getDesignPreferences: () => {
        const { mood, audience, layoutPreference } = get();
        return { mood, audience, layoutPreference };
      },

      isValid: () => {
        const { context } = get();
        return (
          context.length >= LIMITS.contextMinLength && context.length <= LIMITS.contextMaxLength
        );
      },

      charCount: () => get().context.length,

      reset: () =>
        set({
          context: '',
          selectedTemplate: null,
          mood: 'auto' as DesignMood,
          audience: 'general' as DesignAudience,
          layoutPreference: 'auto' as DesignLayout,
        }),
    }),
    {
      name: 'builder-context',
      partialize: (state) => ({
        context: state.context,
        selectedTemplate: state.selectedTemplate,
        mood: state.mood,
        audience: state.audience,
        layoutPreference: state.layoutPreference,
      }),
    }
  )
);
