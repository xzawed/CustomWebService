import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LIMITS } from '@/lib/config/features';
import type {
  DesignMood,
  DesignAudience,
  DesignLayout,
  DesignPreferences,
  PreferenceSuggestion,
} from '@/types/project';

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

  // AI Relevance Gate
  aiSuggestion: PreferenceSuggestion | null;
  relevanceScore: number | null;
  suggestionSource: 'ai' | 'user' | null;
  gateResolved: boolean;

  setAiSuggestion: (suggestion: PreferenceSuggestion | null) => void;
  setRelevanceScore: (score: number | null) => void;
  setSuggestionSource: (source: 'ai' | 'user' | null) => void;
  markGateResolved: () => void;
  clearSuggestion: () => void;
}

export const useContextStore = create<ContextState>()(
  persist(
    (set, get) => ({
      context: '',
      selectedTemplate: null,
      mood: 'auto' as DesignMood,
      audience: 'general' as DesignAudience,
      layoutPreference: 'auto' as DesignLayout,

      // AI Relevance Gate — session-only (persist 미포함)
      aiSuggestion: null,
      relevanceScore: null,
      suggestionSource: null,
      gateResolved: false,

      setContext: (context) => {
        if (context.length <= LIMITS.contextMaxLength) {
          set({ context });
        }
      },

      setTemplate: (selectedTemplate) => set({ selectedTemplate, suggestionSource: 'user' }),
      setMood: (mood) => set({ mood, suggestionSource: 'user' }),
      setAudience: (audience) => set({ audience, suggestionSource: 'user' }),
      setLayoutPreference: (layoutPreference) => set({ layoutPreference, suggestionSource: 'user' }),

      setAiSuggestion: (aiSuggestion) => set({ aiSuggestion }),
      setRelevanceScore: (relevanceScore) => set({ relevanceScore }),
      setSuggestionSource: (suggestionSource) => set({ suggestionSource }),
      markGateResolved: () => set({ gateResolved: true }),
      clearSuggestion: () =>
        set({ aiSuggestion: null, relevanceScore: null, suggestionSource: null, gateResolved: false }),

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
          aiSuggestion: null,
          relevanceScore: null,
          suggestionSource: null,
          gateResolved: false,
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
