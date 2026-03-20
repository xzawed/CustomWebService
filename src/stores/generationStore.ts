import { create } from 'zustand';

type GenerationStatus = 'idle' | 'generating' | 'completed' | 'failed';

interface GenerationState {
  status: GenerationStatus;
  progress: number;
  currentStep: string;
  projectId: string | null;
  error: string | null;

  startGeneration: () => void;
  updateProgress: (progress: number, step: string) => void;
  completeGeneration: (projectId: string) => void;
  failGeneration: (error: string) => void;
  reset: () => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  status: 'idle',
  progress: 0,
  currentStep: '',
  projectId: null,
  error: null,

  startGeneration: () =>
    set({ status: 'generating', progress: 0, currentStep: '', error: null }),

  updateProgress: (progress, currentStep) => set({ progress, currentStep }),

  completeGeneration: (projectId) =>
    set({ status: 'completed', progress: 100, projectId }),

  failGeneration: (error) => set({ status: 'failed', error }),

  reset: () =>
    set({ status: 'idle', progress: 0, currentStep: '', projectId: null, error: null }),
}));
