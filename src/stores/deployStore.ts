import { create } from 'zustand';

type DeployStatus = 'idle' | 'deploying' | 'deployed' | 'failed';

interface DeployState {
  status: DeployStatus;
  progress: number;
  currentStep: string;
  deployUrl: string | null;
  error: string | null;

  startDeploy: () => void;
  updateProgress: (progress: number, step: string) => void;
  completeDeploy: (url: string) => void;
  failDeploy: (error: string) => void;
  reset: () => void;
}

export const useDeployStore = create<DeployState>((set) => ({
  status: 'idle',
  progress: 0,
  currentStep: '',
  deployUrl: null,
  error: null,

  startDeploy: () => set({ status: 'deploying', progress: 0, currentStep: '', error: null }),

  updateProgress: (progress, currentStep) => set({ progress, currentStep }),

  completeDeploy: (deployUrl) => set({ status: 'deployed', progress: 100, deployUrl }),

  failDeploy: (error) => set({ status: 'failed', error }),

  reset: () => set({ status: 'idle', progress: 0, currentStep: '', deployUrl: null, error: null }),
}));
