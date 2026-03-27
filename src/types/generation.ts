export type GenerationStepType =
  | 'analyzing'
  | 'generating_code'
  | 'styling'
  | 'validating';

export interface GenerationStep {
  type: GenerationStepType;
  label: string;
  icon: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface GenerationProgressEvent {
  step: GenerationStepType;
  progress: number;
  message: string;
}

export interface GenerationCompleteEvent {
  projectId: string;
  version: number;
  previewUrl: string;
}
