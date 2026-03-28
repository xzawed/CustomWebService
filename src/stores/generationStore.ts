import { create } from 'zustand';

type GenerationStatus = 'idle' | 'generating' | 'completed' | 'failed';

interface GenerationState {
  status: GenerationStatus;
  progress: number;
  currentStep: string;
  projectId: string | null;
  version: number | null;
  error: string | null;

  startGeneration: () => void;
  updateProgress: (progress: number, step: string) => void;
  completeGeneration: (projectId: string, version?: number) => void;
  failGeneration: (error: string) => void;
  reset: () => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  status: 'idle',
  progress: 0,
  currentStep: '',
  projectId: null,
  version: null,
  error: null,

  startGeneration: () =>
    set({ status: 'generating', progress: 0, currentStep: '', error: null, version: null }),

  updateProgress: (progress, currentStep) => set({ progress, currentStep }),

  completeGeneration: (projectId, version) =>
    set({ status: 'completed', progress: 100, projectId, version: version ?? null }),

  failGeneration: (error) => set({ status: 'failed', error }),

  reset: () =>
    set({ status: 'idle', progress: 0, currentStep: '', projectId: null, version: null, error: null }),
}));
